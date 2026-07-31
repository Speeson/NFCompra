package dev.esgarpe.nfcompra.feature.shoppinglist

import android.content.Context
import android.util.Base64
import androidx.work.BackoffPolicy
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequest
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import androidx.work.workDataOf
import dev.esgarpe.nfcompra.core.database.NfCompraDatabase
import dev.esgarpe.nfcompra.core.network.KeystoreTokenStore
import dev.esgarpe.nfcompra.core.network.NetworkClient
import dev.esgarpe.nfcompra.core.network.SessionSnapshot
import dev.esgarpe.nfcompra.core.network.SessionTokens
import dev.esgarpe.nfcompra.core.network.TokenStore
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.sync.Mutex
import java.security.MessageDigest
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.TimeUnit

class SyncWorker(
    appContext: Context,
    workerParameters: WorkerParameters,
) : CoroutineWorker(appContext, workerParameters) {
    override suspend fun doWork(): Result {
        val accountId = inputData.getString(ACCOUNT_ID)?.takeIf(String::isNotBlank) ?: return Result.failure()
        val baseUrl = inputData.getString(BASE_URL)?.takeIf(String::isNotBlank) ?: return Result.failure()
        val tokenStore = ReloadingAccountTokenStore(
            load = { KeystoreTokenStore(applicationContext) },
            accountId = accountId,
        )
        if (tokenStore.current() == null) return Result.retry()
        val database = NfCompraDatabase.create(applicationContext, accountId)
        return try {
            val api = NetworkClient.bearerApi(
                baseUrl,
                tokenStore,
                ShoppingListApi::class.java,
            )
            val syncState = ShoppingSyncCoordinator.forAccount(accountId)
            val synchronizer = OperationSynchronizer(
                api,
                database.shoppingDao(),
                syncMutex = syncState.syncMutex,
                databaseMutex = syncState.databaseMutex,
                itemAliases = syncState.itemAliases,
            )
            syncLoop@ while (true) {
                when (synchronizer.syncNext()) {
                    SyncResult.Idle, SyncResult.Conflict -> break@syncLoop
                    SyncResult.Succeeded, SyncResult.Failed -> Unit
                    SyncResult.Retry -> return Result.retry()
                }
            }
            Result.success()
        } finally {
            NfCompraDatabase.release(accountId, database)
        }
    }

    companion object {
        const val ACCOUNT_ID = "accountId"
        const val BASE_URL = "baseUrl"
        private const val MIN_BACKOFF_SECONDS = 10L

        fun request(accountId: String, baseUrl: String): OneTimeWorkRequest =
            OneTimeWorkRequestBuilder<SyncWorker>()
                .setInputData(workDataOf(ACCOUNT_ID to accountId, BASE_URL to baseUrl))
                .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
                .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, MIN_BACKOFF_SECONDS, TimeUnit.SECONDS)
                .build()

        fun enqueue(context: Context, accountId: String, baseUrl: String) {
            WorkManager.getInstance(context.applicationContext).enqueueUniqueWork(
                uniqueWorkName(accountId),
                ExistingWorkPolicy.APPEND_OR_REPLACE,
                request(accountId, baseUrl),
            )
        }

        fun cancel(context: Context, accountId: String) {
            WorkManager.getInstance(context.applicationContext).cancelUniqueWork(uniqueWorkName(accountId))
        }

        internal fun uniqueWorkName(accountId: String): String {
            val digest = MessageDigest.getInstance("SHA-256")
                .digest(accountId.toByteArray(Charsets.UTF_8))
                .take(16)
                .joinToString("") { byte -> "%02x".format(byte) }
            return "nfcompra-shopping-sync-$digest"
        }

        internal fun tokenBelongsToAccount(accessToken: String, accountId: String): Boolean = runCatching {
            val payload = accessToken.split('.')[1]
            val decoded = Base64.decode(
                payload,
                Base64.URL_SAFE or Base64.NO_PADDING or Base64.NO_WRAP,
            ).decodeToString()
            Regex("\\\"sub\\\"\\s*:\\s*\\\"([^\\\"]+)\\\"")
                .find(decoded)?.groupValues?.get(1) == accountId
        }.getOrDefault(false)
    }
}

internal object ShoppingSyncCoordinator {
    private val accountStates = ConcurrentHashMap<String, ShoppingSyncState>()

    fun forAccount(accountId: String): ShoppingSyncState = accountStates.getOrPut(accountId) { ShoppingSyncState() }

    fun acquireRepository(accountId: String): ShoppingSyncState = forAccount(accountId).also {
        it.acquireRepository()
    }
}

internal class ShoppingSyncState(
    val syncMutex: Mutex = Mutex(),
    val databaseMutex: Mutex = Mutex(),
    val itemAliases: ItemIdAliases = ItemIdAliases(),
) {
    private val ownershipLock = Any()
    private var repositoryOwners = 0

    fun acquireRepository() = synchronized(ownershipLock) {
        repositoryOwners += 1
    }

    fun releaseRepository(onLastRepository: () -> Unit) = synchronized(ownershipLock) {
        check(repositoryOwners > 0) { "No shopping repository ownership remains for this account." }
        repositoryOwners -= 1
        if (repositoryOwners == 0) onLastRepository()
    }
}

internal class ReloadingAccountTokenStore(
    private val load: () -> TokenStore,
    private val accountId: String,
) : TokenStore {
    override val session: StateFlow<SessionTokens?>
        get() = MutableStateFlow(current())

    override fun current(): SessionTokens? = load().current()?.takeIf(::belongsToAccount)
    override fun generation(): Long = load().generation()
    override fun snapshot(): SessionSnapshot? = load().snapshot()?.takeIf { belongsToAccount(it.tokens) }
    override suspend fun read(): SessionTokens? = load().read()?.takeIf(::belongsToAccount)

    override suspend fun save(tokens: SessionTokens) {
        require(belongsToAccount(tokens)) { "La sesión no pertenece a la cola de sincronización." }
        error("Background synchronization cannot replace the interactive session.")
    }

    override suspend fun clear() = Unit

    override suspend fun compareAndStart(expectedGeneration: Long, tokens: SessionTokens): Boolean =
        false

    override suspend fun compareAndSave(expected: SessionSnapshot, tokens: SessionTokens): Boolean =
        false

    override suspend fun compareAndClear(expected: SessionSnapshot): Boolean =
        false

    private fun belongsToAccount(tokens: SessionTokens): Boolean =
        SyncWorker.tokenBelongsToAccount(tokens.accessToken, accountId)
}
