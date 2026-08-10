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
            assets = listOf(
                GitHubReleaseAsset(
                    name = "NFCompra-debug.apk",
                    browserDownloadUrl = "https://github.com/Speeson/NFCompra/releases/download/v0.1.2/NFCompra-debug.apk",
                ),
            ),
        )

        val update = findAppUpdate(
            currentVersionName = "0.1.1",
            release = release,
            apkAssetName = "NFCompra-debug.apk",
        )

        assertEquals("0.1.2", update?.versionName)
        assertEquals("NFCompra-debug.apk", update?.assetName)
    }

    @Test
    fun `ignores same release version`() {
        val release = GitHubRelease(
            tagName = "v0.1.1",
            name = "NFCompra 0.1.1",
            htmlUrl = "https://github.com/Speeson/NFCompra/releases/tag/v0.1.1",
            assets = listOf(GitHubReleaseAsset("NFCompra-debug.apk", "https://example.test/app.apk")),
        )

        assertNull(findAppUpdate("0.1.1", release, "NFCompra-debug.apk"))
    }

    @Test
    fun `ignores newer release without apk asset`() {
        val release = GitHubRelease(
            tagName = "v0.1.2",
            name = "NFCompra 0.1.2",
            htmlUrl = "https://github.com/Speeson/NFCompra/releases/tag/v0.1.2",
            assets = listOf(GitHubReleaseAsset("notes.txt", "https://example.test/notes.txt")),
        )

        assertNull(findAppUpdate("0.1.1", release, "NFCompra-debug.apk"))
    }
}
