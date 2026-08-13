UPDATE product_categories
SET
  icon_key = 'hair-care',
  updated_at = '2026-08-14T00:00:00.000Z'
WHERE normalized_name LIKE '%cabello%'
  OR normalized_name LIKE '%capilar%';
