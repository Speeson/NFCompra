package dev.esgarpe.nfcompra.feature.sharing

class AuthenticatedRefreshGate {
    private var authenticated = false
    fun setAuthenticated(value: Boolean) { authenticated = value }
    fun onForeground(refresh: () -> Unit) { if (authenticated) refresh() }
}
