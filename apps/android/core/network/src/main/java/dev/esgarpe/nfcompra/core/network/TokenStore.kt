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

data class SessionTokens(val accessToken: String, val refreshToken: String)

interface TokenStore {
    val session: StateFlow<SessionTokens?>
    fun current(): SessionTokens?
    suspend fun read(): SessionTokens?
    suspend fun save(tokens: SessionTokens)
    suspend fun clear()
    suspend fun compareAndClear(expected: SessionTokens): Boolean
}

/** Tokens are encrypted before persisting; the encryption key never leaves Android Keystore. */
class KeystoreTokenStore(context: Context) : TokenStore {
    private val preferences = context.getSharedPreferences("nfcompra.session", Context.MODE_PRIVATE)
    private val sessionLock = Any()
    private val mutableSession = MutableStateFlow(readEncrypted())
    override val session: StateFlow<SessionTokens?> = mutableSession

    override fun current(): SessionTokens? = session.value
    override suspend fun read(): SessionTokens? = session.value

    override suspend fun save(tokens: SessionTokens) {
        val access = encrypt(tokens.accessToken)
        val refresh = encrypt(tokens.refreshToken)
        synchronized(sessionLock) {
            if (!preferences.edit()
                .putString(ACCESS_TOKEN, access)
                .putString(REFRESH_TOKEN, refresh)
                .commit()
            ) throw IOException("No se pudo guardar la sesión.")
            mutableSession.value = tokens
        }
    }

    override suspend fun clear() {
        synchronized(sessionLock) {
            clearLocked()
        }
    }

    override suspend fun compareAndClear(expected: SessionTokens): Boolean = synchronized(sessionLock) {
        if (session.value != expected) return@synchronized false
        clearLocked()
        true
    }

    private fun clearLocked() {
        if (!preferences.edit().remove(ACCESS_TOKEN).remove(REFRESH_TOKEN).commit()) {
            throw IOException("No se pudo borrar la sesión.")
        }
        mutableSession.value = null
    }

    private fun readEncrypted(): SessionTokens? {
        val access = preferences.getString(ACCESS_TOKEN, null)?.let(::decrypt) ?: return null
        val refresh = preferences.getString(REFRESH_TOKEN, null)?.let(::decrypt) ?: return null
        return SessionTokens(access, refresh)
    }

    private fun encrypt(value: String): String {
        val cipher = Cipher.getInstance(TRANSFORMATION)
        cipher.init(Cipher.ENCRYPT_MODE, secretKey())
        val encrypted = cipher.doFinal(value.toByteArray(Charsets.UTF_8))
        return "${Base64.encodeToString(cipher.iv, Base64.NO_WRAP)}:${Base64.encodeToString(encrypted, Base64.NO_WRAP)}"
    }

    private fun decrypt(value: String): String? = runCatching {
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
        const val ACCESS_TOKEN = "access_token"
        const val REFRESH_TOKEN = "refresh_token"
        const val KEYSTORE = "AndroidKeyStore"
        const val KEY_ALIAS = "nfcompra.session.aes"
        const val TRANSFORMATION = "AES/GCM/NoPadding"
    }
}
