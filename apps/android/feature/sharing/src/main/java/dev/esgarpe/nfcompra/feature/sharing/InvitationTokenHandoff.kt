package dev.esgarpe.nfcompra.feature.sharing

import java.net.URI
import java.net.URLDecoder
import java.nio.charset.StandardCharsets

/** Holds a deep-link secret only in Activity lifecycle state, never in durable app storage. */
class InvitationTokenHandoff(restoredToken: String? = null) {
    var token: String? = restoredToken?.takeIf { it.isNotBlank() }
        private set

    fun receive(rawToken: String?) {
        token = rawToken?.takeIf { it.isNotBlank() }
    }

    fun receiveLink(rawLink: String?) {
        invitationToken(rawLink)?.let(::receive)
    }

    fun savedStateToken(): String? = token

    fun clear() { token = null }

    private fun invitationToken(rawLink: String?): String? {
        val uri = rawLink?.let { runCatching { URI(it) }.getOrNull() } ?: return null
        val supportedOrigin =
            uri.scheme.equals("https", ignoreCase = true) && uri.host.equals(PRODUCTION_HOST, ignoreCase = true) ||
                uri.scheme.equals("nfcompra", ignoreCase = true) && uri.host.equals("app", ignoreCase = true)
        if (!supportedOrigin || uri.path != INVITATION_PATH) return null
        return uri.rawQuery
            ?.split('&')
            ?.firstNotNullOfOrNull { field ->
                val separator = field.indexOf('=')
                if (separator < 0 || decode(field.substring(0, separator)) != "token") null
                else decode(field.substring(separator + 1)).takeIf { it.isNotBlank() }
            }
    }

    private fun decode(value: String): String =
        runCatching { URLDecoder.decode(value, StandardCharsets.UTF_8) }.getOrDefault("")

    private companion object {
        const val PRODUCTION_HOST = "nfcompra.esgarpe.dev"
        const val INVITATION_PATH = "/invitations/accept"
    }
}
