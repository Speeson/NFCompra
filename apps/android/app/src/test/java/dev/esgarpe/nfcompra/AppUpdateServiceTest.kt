package dev.esgarpe.nfcompra

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class AppUpdateServiceTest {
    @Test
    fun `finds newer release with apk asset`() {
        val release = GitHubRelease(
            tagName = "v0.1.2",
            name = "NFCompra 0.1.2",
            htmlUrl = "https://github.com/Speeson/NFCompra/releases/tag/v0.1.2",
            body = "Cambios de prueba",
            assets = listOf(
                GitHubReleaseAsset(
                    name = "NFCompra-release.apk",
                    browserDownloadUrl = "https://github.com/Speeson/NFCompra/releases/download/v0.1.2/NFCompra-release.apk",
                    sizeBytes = 25_165_824L,
                ),
            ),
        )

        val update = findAppUpdate(
            currentVersionName = "0.1.1",
            release = release,
            apkAssetName = "NFCompra-release.apk",
        )

        assertEquals("0.1.2", update?.versionName)
        assertEquals("NFCompra-release.apk", update?.assetName)
        assertEquals("Cambios de prueba", update?.changelog)
        assertEquals(25_165_824L, update?.sizeBytes)
    }

    @Test
    fun `ignores same release version`() {
        val release = GitHubRelease(
            tagName = "v0.1.1",
            name = "NFCompra 0.1.1",
            htmlUrl = "https://github.com/Speeson/NFCompra/releases/tag/v0.1.1",
            body = "",
            assets = listOf(GitHubReleaseAsset("NFCompra-release.apk", "https://example.test/app.apk", 1L)),
        )

        assertNull(findAppUpdate("0.1.1", release, "NFCompra-release.apk"))
    }

    @Test
    fun `ignores newer release without apk asset`() {
        val release = GitHubRelease(
            tagName = "v0.1.2",
            name = "NFCompra 0.1.2",
            htmlUrl = "https://github.com/Speeson/NFCompra/releases/tag/v0.1.2",
            body = "",
            assets = listOf(GitHubReleaseAsset("notes.txt", "https://example.test/notes.txt", 1L)),
        )

        assertNull(findAppUpdate("0.1.1", release, "NFCompra-release.apk"))
    }

    @Test
    fun `formats download progress values`() {
        val progress = AppUpdateDownloadProgress(
            downloadedBytes = 5L * 1024L * 1024L,
            totalBytes = 10L * 1024L * 1024L,
            bytesPerSecond = 2L * 1024L * 1024L,
        )

        assertEquals(50, progress.percent)
        assertEquals("10.0 MB", formatBytes(progress.totalBytes))
        assertEquals("2.0 MB/s", formatSpeed(progress.bytesPerSecond))
    }
}
