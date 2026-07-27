package dev.esgarpe.nfcompra.feature.sharing

/** Holds a deep-link secret only for the current Activity instance. */
class InvitationTokenHandoff {
    var token: String? = null
        private set

    fun receive(rawToken: String?) {
        token = rawToken?.takeIf { it.isNotBlank() }
    }

    fun clear() { token = null }
}
