package dev.esgarpe.nfcompra.feature.shoppinglist

internal fun catalogCategoryImageRes(normalizedName: String): Int? = when (normalizedName) {
    "aceite, especias y salsas" -> R.drawable.catalog_aceite_especias_y_salsas
    "agua y refrescos" -> R.drawable.catalog_agua_y_refrescos
    "aperitivos" -> R.drawable.catalog_aperitivos
    "arroz, legumbres y pasta" -> R.drawable.catalog_arroz_legumbres_y_pasta
    "azucar, caramelos y chocolate" -> R.drawable.catalog_azucar_caramelos_y_chocolate
    "bebe" -> R.drawable.catalog_bebe
    "bodega" -> R.drawable.catalog_bodega
    "cacao, cafe e infusiones" -> R.drawable.catalog_cacao_cafe_e_infusiones
    "carne" -> R.drawable.catalog_carne
    "cereales y galletas" -> R.drawable.catalog_cereales_y_galletas
    "charcuteria y quesos" -> R.drawable.catalog_charcuteria_y_quesos
    "congelados" -> R.drawable.catalog_congelados
    "conservas, caldos y cremas" -> R.drawable.catalog_conservas_caldos_y_cremas
    "cuidado del cabello" -> R.drawable.catalog_cuidado_del_cabello
    "cuidado facial y corporal" -> R.drawable.catalog_cuidado_facial_y_corporal
    "fitoterapia y parafarmacia" -> R.drawable.catalog_fitoterapia_y_parafarmacia
    "fruta y verdura" -> R.drawable.catalog_fruta_y_verdura
    "huevos, leche y mantequilla" -> R.drawable.catalog_huevos_leche_y_mantequilla
    "limpieza y hogar" -> R.drawable.catalog_limpieza_y_hogar
    "maquillaje" -> R.drawable.catalog_maquillaje
    "marisco y pescado" -> R.drawable.catalog_marisco_y_pescado
    "mascotas" -> R.drawable.catalog_mascotas
    "panaderia y pasteleria" -> R.drawable.catalog_panaderia_y_pasteleria
    "pizzas y platos preparados" -> R.drawable.catalog_pizzas_y_platos_preparados
    "postres y yogures" -> R.drawable.catalog_postres_y_yogures
    "zumos" -> R.drawable.catalog_zumos
    else -> null
}
