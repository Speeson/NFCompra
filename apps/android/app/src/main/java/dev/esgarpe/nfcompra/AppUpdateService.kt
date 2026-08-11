package dev.esgarpe.nfcompra

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import androidx.core.content.FileProvider
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.io.File
import java.net.HttpURLConnection
import java.net.URL

internal data class GitHubReleaseAsset(
    val name: String,
    val browserDownloadUrl: String,
    val sizeBytes: Long,
)

internal data class GitHubRelease(
    val tagName: String,
    val name: String,
    val htmlUrl: String,
    val body: String,
    val assets: List<GitHubReleaseAsset>,
)

internal data class AppUpdateInfo(
    val versionName: String,
    val releaseName: String,
    val assetName: String,
    val downloadUrl: String,
    val releaseUrl: String,
    val changelog: String,
    val sizeBytes: Long,
)

internal data class AppUpdateDownloadProgress(
    val downloadedBytes: Long,
    val totalBytes: Long,
    val bytesPerSecond: Long,
)

internal val AppUpdateDownloadProgress.percent: Int
    get() = if (totalBytes <= 0L) 0 else ((downloadedBytes * 100) / totalBytes).coerceIn(0, 100).toInt()

internal fun formatBytes(bytes: Long): String {
    if (bytes <= 0L) return "0 MB"
    val megabytes = bytes / (1024.0 * 1024.0)
    return "%.1f MB".format(java.util.Locale.US, megabytes)
}

internal fun formatSpeed(bytesPerSecond: Long): String =
    "${formatBytes(bytesPerSecond)}/s"

internal fun findAppUpdate(
    currentVersionName: String,
    release: GitHubRelease,
    apkAssetName: String,
): AppUpdateInfo? {
    val releaseVersion = release.tagName.removePrefix("v").trim()
    if (compareVersions(releaseVersion, currentVersionName) <= 0) return null
    val apkAsset = release.assets.firstOrNull { it.name == apkAssetName }
        ?: release.assets.firstOrNull { it.name.endsWith(".apk", ignoreCase = true) }
        ?: return null
    return AppUpdateInfo(
        versionName = releaseVersion,
        releaseName = release.name.ifBlank { release.tagName },
        assetName = apkAsset.name,
        downloadUrl = apkAsset.browserDownloadUrl,
        releaseUrl = release.htmlUrl,
        changelog = release.body.trim(),
        sizeBytes = apkAsset.sizeBytes,
    )
}

internal fun findCurrentReleaseInfo(
    currentVersionName: String,
    release: GitHubRelease,
    apkAssetName: String,
): AppUpdateInfo? {
    val releaseVersion = release.tagName.removePrefix("v").trim()
    if (compareVersions(releaseVersion, currentVersionName) != 0) return null
    val apkAsset = release.assets.firstOrNull { it.name == apkAssetName }
        ?: release.assets.firstOrNull { it.name.endsWith(".apk", ignoreCase = true) }
        ?: return null
    return AppUpdateInfo(
        versionName = releaseVersion,
        releaseName = release.name.ifBlank { release.tagName },
        assetName = apkAsset.name,
        downloadUrl = apkAsset.browserDownloadUrl,
        releaseUrl = release.htmlUrl,
        changelog = release.body.trim(),
        sizeBytes = apkAsset.sizeBytes,
    )
}

private fun compareVersions(left: String, right: String): Int {
    val leftParts = left.split('.', '-').mapNotNull { it.toIntOrNull() }
    val rightParts = right.split('.', '-').mapNotNull { it.toIntOrNull() }
    val max = maxOf(leftParts.size, rightParts.size)
    repeat(max) { index ->
        val diff = leftParts.getOrElse(index) { 0 } - rightParts.getOrElse(index) { 0 }
        if (diff != 0) return diff
    }
    return 0
}

internal class AppUpdateService(
    private val context: Context,
) {
    suspend fun checkLatestRelease(): AppUpdateInfo? = withContext(Dispatchers.IO) {
        val release = fetchRelease(GITHUB_LATEST_RELEASE_URL)
        findAppUpdate(
            currentVersionName = BuildConfig.VERSION_NAME,
            release = release,
            apkAssetName = APK_ASSET_NAME,
        )
    }

    suspend fun currentReleaseInfo(): AppUpdateInfo? = withContext(Dispatchers.IO) {
        val release = fetchRelease(GITHUB_LATEST_RELEASE_URL)
        findCurrentReleaseInfo(
            currentVersionName = BuildConfig.VERSION_NAME,
            release = release,
            apkAssetName = APK_ASSET_NAME,
        )
    }

    suspend fun downloadApk(
        update: AppUpdateInfo,
        onProgress: suspend (AppUpdateDownloadProgress) -> Unit = {},
    ): File = withContext(Dispatchers.IO) {
        val updatesDir = File(context.cacheDir, "updates").apply { mkdirs() }
        val destination = File(updatesDir, "NFCompra-${update.versionName}.apk")
        val connection = openConnection(update.downloadUrl)
        val totalBytes = connection.contentLengthLong.takeIf { it > 0L } ?: update.sizeBytes
        var downloadedBytes = 0L
        val startedAt = System.nanoTime()
        val buffer = ByteArray(DEFAULT_BUFFER_SIZE)
        connection.inputStream.use { input ->
            destination.outputStream().use { output ->
                while (true) {
                    val read = input.read(buffer)
                    if (read == -1) break
                    output.write(buffer, 0, read)
                    downloadedBytes += read
                    val elapsedSeconds = ((System.nanoTime() - startedAt) / 1_000_000_000.0).coerceAtLeast(0.1)
                    withContext(Dispatchers.Main) {
                        onProgress(AppUpdateDownloadProgress(
                            downloadedBytes = downloadedBytes,
                            totalBytes = totalBytes,
                            bytesPerSecond = (downloadedBytes / elapsedSeconds).toLong(),
                        ))
                    }
                }
            }
        }
        withContext(Dispatchers.Main) { onProgress(AppUpdateDownloadProgress(downloadedBytes, totalBytes, 0L)) }
        destination
    }

    fun startInstall(apkFile: File): Boolean {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O &&
            !context.packageManager.canRequestPackageInstalls()
        ) {
            val settingsIntent = Intent(
                Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                Uri.parse("package:${context.packageName}"),
            ).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            context.startActivity(settingsIntent)
            return false
        }
        val apkUri = FileProvider.getUriForFile(
            context,
            "${context.packageName}.fileprovider",
            apkFile,
        )
        val installIntent = Intent(Intent.ACTION_VIEW)
            .setDataAndType(apkUri, "application/vnd.android.package-archive")
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        context.startActivity(installIntent)
        return true
    }

    private fun fetchRelease(url: String): GitHubRelease {
        val json = JSONObject(openConnection(url).inputStream.bufferedReader().use { it.readText() })
        val assetsJson = json.getJSONArray("assets")
        val assets = buildList {
            for (index in 0 until assetsJson.length()) {
                val asset = assetsJson.getJSONObject(index)
                add(
                    GitHubReleaseAsset(
                        name = asset.getString("name"),
                        browserDownloadUrl = asset.getString("browser_download_url"),
                        sizeBytes = asset.optLong("size", 0L),
                    ),
                )
            }
        }
        return GitHubRelease(
            tagName = json.getString("tag_name"),
            name = json.optString("name"),
            htmlUrl = json.optString("html_url"),
            body = json.optString("body"),
            assets = assets,
        )
    }

    private fun openConnection(url: String): HttpURLConnection =
        (URL(url).openConnection() as HttpURLConnection).apply {
            connectTimeout = 10_000
            readTimeout = 30_000
            requestMethod = "GET"
            setRequestProperty("Accept", "application/vnd.github+json")
            setRequestProperty("User-Agent", "NFCompra-Android/${BuildConfig.VERSION_NAME}")
        }

    private companion object {
        const val GITHUB_LATEST_RELEASE_URL =
            "https://api.github.com/repos/Speeson/NFCompra/releases/latest"
        const val APK_ASSET_NAME = "NFCompra-release.apk"
    }
}
