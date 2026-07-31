package dev.esgarpe.nfcompra.core.network

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import java.security.KeyStore
import java.io.IOException
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec
import java.util.WeakHashMap

data class SessionTokens(val accessToken: String, val refreshToken: String)
data class SessionSnapshot(val identity: Long, val tokens: SessionTokens)

interface TokenStore {
    val session: StateFlow<SessionTokens?>
    fun current(): SessionTokens?
    fun generation(): Long
    fun snapshot(): SessionSnapshot?
    suspend fun read(): SessionTokens?
    suspend fun save(tokens: SessionTokens)
    suspend fun clear()
    suspend fun compareAndStart(expectedGeneration: Long, tokens: SessionTokens): Boolean
    suspend fun compareAndSave(expected: SessionSnapshot, tokens: SessionTokens): Boolean
    suspend fun compareAndClear(expected: SessionSnapshot): Boolean
}

internal interface EncryptedSessionPreferences {
    val access: String?
    val refresh: String?
    fun replace(access: String?, refresh: String?): Boolean
}

internal class SessionTokenPersistence(
    private val preferences: EncryptedSessionPreferences,
) {
    fun save(access: String, refresh: String) {
        replaceOrRollback(access, refresh, "No se pudo guardar la sesión.")
    }

    fun clear() {
        replaceOrRollback(null, null, "No se pudo borrar la sesión.")
    }

    private fun replaceOrRollback(access: String?, refresh: String?, failureMessage: String) {
        val previousAccess = preferences.access
        val previousRefresh = preferences.refresh
        if (preferences.replace(access, refresh)) return

        // SharedPreferences updates its in-memory map before reporting a disk-write failure.
        // Restore the prior values so a new TokenStore cannot observe an uncommitted session.
        preferences.replace(previousAccess, previousRefresh)
        throw IOException(failureMessage)
    }
}

internal interface SessionCipher {
    fun encrypt(value: String): String
    fun decrypt(value: String): String?
}

/**
 * Lightweight facade over the application-scoped session store. Every facade created after an
 * Activity recreation shares the same generation, lock and flow, so its compare-and-set methods
 * cannot race a facade that was retained by an older request.
 */
class KeystoreTokenStore private constructor(
    private val delegate: TokenStore,
) : TokenStore by delegate {
    constructor(context: Context) : this(
        ApplicationSessionStores.get(context.applicationContext) { AndroidKeystoreSessionCipher() },
    )

    internal constructor(context: Context, cipher: SessionCipher) : this(
        ApplicationSessionStores.get(context.applicationContext) { cipher },
    )
}

private object ApplicationSessionStores {
    private val stores = WeakHashMap<Context, TokenStore>()

    fun get(context: Context, cipher: () -> SessionCipher): TokenStore = synchronized(stores) {
        stores.getOrPut(context) { EncryptedPreferencesTokenStore(context, cipher()) }
    }
}

private class EncryptedPreferencesTokenStore(
    context: Context,
    private val cipher: SessionCipher,
) : TokenStore {
    private val preferences = context.getSharedPreferences("nfcompra.session", Context.MODE_PRIVATE)
    private val persistence = SessionTokenPersistence(object : EncryptedSessionPreferences {
        override val access: String?
            get() = preferences.getString(ACCESS_TOKEN, null)
        override val refresh: String?
            get() = preferences.getString(REFRESH_TOKEN, null)

        override fun replace(access: String?, refresh: String?): Boolean = preferences.edit().apply {
            if (access == null) remove(ACCESS_TOKEN) else putString(ACCESS_TOKEN, access)
            if (refresh == null) remove(REFRESH_TOKEN) else putString(REFRESH_TOKEN, refresh)
        }.commit()
    })
    private val sessionLock = Any()
    private val mutableSession = MutableStateFlow(readEncrypted())
    private var sessionIdentity = if (mutableSession.value == null) 0L else 1L
    override val session: StateFlow<SessionTokens?> = mutableSession

    override fun current(): SessionTokens? = synchronized(sessionLock) { session.value }
    override fun generation(): Long = synchronized(sessionLock) { sessionIdentity }
    override fun snapshot(): SessionSnapshot? = synchronized(sessionLock) {
        session.value?.let { SessionSnapshot(sessionIdentity, it) }
    }
    override suspend fun read(): SessionTokens? = current()

    override suspend fun save(tokens: SessionTokens) {
        synchronized(sessionLock) {
            persistLocked(tokens)
            sessionIdentity++
            mutableSession.value = tokens
        }
    }

    override suspend fun clear() {
        synchronized(sessionLock) {
            clearLocked()
        }
    }

    override suspend fun compareAndStart(expectedGeneration: Long, tokens: SessionTokens): Boolean =
        synchronized(sessionLock) {
            if (sessionIdentity != expectedGeneration) return@synchronized false
            persistLocked(tokens)
            sessionIdentity++
            mutableSession.value = tokens
            true
        }

    override suspend fun compareAndSave(expected: SessionSnapshot, tokens: SessionTokens): Boolean =
        synchronized(sessionLock) {
            if (!matchesLocked(expected)) return@synchronized false
            persistLocked(tokens)
            sessionIdentity++
            mutableSession.value = tokens
            true
        }

    override suspend fun compareAndClear(expected: SessionSnapshot): Boolean = synchronized(sessionLock) {
        if (!matchesLocked(expected)) return@synchronized false
        clearLocked()
        true
    }

    private fun matchesLocked(expected: SessionSnapshot): Boolean =
        sessionIdentity == expected.identity && session.value == expected.tokens

    private fun persistLocked(tokens: SessionTokens) {
        val access = cipher.encrypt(tokens.accessToken)
        val refresh = cipher.encrypt(tokens.refreshToken)
        persistence.save(access, refresh)
    }

    private fun clearLocked() {
        persistence.clear()
        sessionIdentity++
        mutableSession.value = null
    }

    private fun readEncrypted(): SessionTokens? {
        val access = preferences.getString(ACCESS_TOKEN, null)?.let(cipher::decrypt) ?: return null
        val refresh = preferences.getString(REFRESH_TOKEN, null)?.let(cipher::decrypt) ?: return null
        return SessionTokens(access, refresh)
    }

    private companion object {
        const val ACCESS_TOKEN = "access_token"
        const val REFRESH_TOKEN = "refresh_token"
    }
}

/** Tokens are encrypted before persisting; the encryption key never leaves Android Keystore. */
private class AndroidKeystoreSessionCipher : SessionCipher {
    override fun encrypt(value: String): String {
        val cipher = Cipher.getInstance(TRANSFORMATION)
        cipher.init(Cipher.ENCRYPT_MODE, secretKey())
        val encrypted = cipher.doFinal(value.toByteArray(Charsets.UTF_8))
        return "${Base64.encodeToString(cipher.iv, Base64.NO_WRAP)}:${Base64.encodeToString(encrypted, Base64.NO_WRAP)}"
    }

    override fun decrypt(value: String): String? = runCatching {
        val (iv, encrypted) = value.split(':', limit = 2)
        val cipher = Cipher.getInstance(TRANSFORMATION)
        cipher.init(Cipher.DECRYPT_MODE, secretKey(), GCMParameterSpec(128, Base64.decode(iv, Base64.NO_WRAP)))
        String(cipher.doFinal(Base64.decode(encrypted, Base64.NO_WRAP)), Charsets.UTF_8)
    }.getOrNull()

    private fun secretKey(): SecretKey {
        val keyStore = KeyStore.getInstance(KEYSTORE).apply { load(null) }
        val existing = keyStore.getKey(KEY_ALIAS, null) as? SecretKey
        if (existing != null) return existing
        return KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, KEYSTORE).apply {
            init(
                KeyGenParameterSpec.Builder(KEY_ALIAS, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
                    .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                    .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                    .build(),
            )
        }.generateKey()
    }

    private companion object {
        const val KEYSTORE = "AndroidKeyStore"
        const val KEY_ALIAS = "nfcompra.session.aes"
        const val TRANSFORMATION = "AES/GCM/NoPadding"
    }
}
