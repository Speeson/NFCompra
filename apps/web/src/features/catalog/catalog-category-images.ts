const catalogCategoryImages: Record<string, string> = {
  'aceite, especias y salsas': 'catalog_aceite_especias_y_salsas.webp',
  'agua y refrescos': 'catalog_agua_y_refrescos.webp',
  aperitivos: 'catalog_aperitivos.webp',
  'arroz, legumbres y pasta': 'catalog_arroz_legumbres_y_pasta.webp',
  'azucar, caramelos y chocolate': 'catalog_azucar_caramelos_y_chocolate.webp',
  bebe: 'catalog_bebe.webp',
  bodega: 'catalog_bodega.webp',
  'cacao, cafe e infusiones': 'catalog_cacao_cafe_e_infusiones.webp',
  carne: 'catalog_carne.webp',
  'cereales y galletas': 'catalog_cereales_y_galletas.webp',
  'charcuteria y quesos': 'catalog_charcuteria_y_quesos.webp',
  congelados: 'catalog_congelados.webp',
  'conservas, caldos y cremas': 'catalog_conservas_caldos_y_cremas.webp',
  'cuidado del cabello': 'catalog_cuidado_del_cabello.webp',
  'cuidado facial y corporal': 'catalog_cuidado_facial_y_corporal.webp',
  'fitoterapia y parafarmacia': 'catalog_fitoterapia_y_parafarmacia.webp',
  'fruta y verdura': 'catalog_fruta_y_verdura.webp',
  'huevos, leche y mantequilla': 'catalog_huevos_leche_y_mantequilla.webp',
  'limpieza y hogar': 'catalog_limpieza_y_hogar.webp',
  maquillaje: 'catalog_maquillaje.webp',
  'marisco y pescado': 'catalog_marisco_y_pescado.webp',
  mascotas: 'catalog_mascotas.webp',
  'panaderia y pasteleria': 'catalog_panaderia_y_pasteleria.webp',
  'pizzas y platos preparados': 'catalog_pizzas_y_platos_preparados.webp',
  'postres y yogures': 'catalog_postres_y_yogures.webp',
  zumos: 'catalog_zumos.webp',
};

export function catalogCategoryImageSource(normalizedName: string): string | null {
  const filename = catalogCategoryImages[normalizedName];
  return filename ? `/catalog-images/${filename}` : null;
}
