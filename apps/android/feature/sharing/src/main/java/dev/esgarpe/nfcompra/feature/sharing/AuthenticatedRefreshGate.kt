package dev.esgarpe.nfcompra.feature.sharing

class AuthenticatedRefreshGate(private val isAuthenticated: () -> Boolean) {
    fun onForeground(refresh: () -> Unit) { if (isAuthenticated()) refresh() }
}
