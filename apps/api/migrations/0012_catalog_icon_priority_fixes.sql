DROP TABLE IF EXISTS _catalog_icon_rules;
CREATE TABLE _catalog_icon_rules (
  rule_order INTEGER PRIMARY KEY,
  text_like TEXT NOT NULL,
  icon_key TEXT NOT NULL
);

INSERT INTO _catalog_icon_rules (rule_order, text_like, icon_key) VALUES
  (10, '%panal%', 'diaper'),
  (11, '%panales%', 'diaper'),
  (20, '%refresco%', 'soft-drink'),
  (21, '%gaseosa%', 'soft-drink'),
  (22, '%coca-cola%', 'soft-drink'),
  (23, '%cola %', 'soft-drink'),
  (30, '%agua mineral%', 'water'),
  (31, '%agua con gas%', 'water'),
  (32, '%agua de soda%', 'water'),
  (33, '%agua de coco%', 'water'),
  (34, '%agua destilada%', 'water'),
  (40, '%zumo%', 'juice'),
  (41, '%jugo%', 'juice'),
  (50, '%cerveza%', 'beer'),
  (60, '%vino%', 'wine'),
  (61, '%bodega%', 'wine'),
  (65, 'cafe %', 'coffee'),
  (66, '% cafe %', 'coffee'),
  (67, '% cafe', 'coffee'),
  (68, '%capuccino%', 'coffee'),
  (69, '%cappuccino%', 'coffee'),
  (70, '%bebida%', 'drink'),
  (80, '%acondicionador%', 'hair-care'),
  (81, '%pantene%', 'hair-care'),
  (82, '%cabello%', 'hair-care'),
  (83, '%capilar%', 'hair-care'),
  (90, '%preservativo%', 'condom'),
  (100, '%lagrima%', 'eye-care'),
  (101, '%lente de contacto%', 'eye-care'),
  (102, '%ojos%', 'eye-care'),
  (110, '%mosquito%', 'repellent'),
  (111, '%citronela%', 'repellent'),
  (112, '%repelente%', 'repellent'),
  (113, '%picor%', 'repellent'),
  (120, '%alcohol%', 'antiseptic'),
  (121, '%antiseptico%', 'antiseptic'),
  (122, '%desinfectante%', 'antiseptic'),
  (123, '%clorhexidina%', 'antiseptic'),
  (124, '%povidona%', 'antiseptic'),
  (130, '%tirita%', 'bandage'),
  (131, '%tira adhesiva%', 'bandage'),
  (132, '%aposito%', 'bandage'),
  (133, '%esparadrapo%', 'bandage'),
  (134, '%venda%', 'bandage'),
  (135, '%gasa%', 'bandage'),
  (140, '%algodon%', 'cotton'),
  (141, '%bastoncillo%', 'cotton'),
  (150, '%capsula%', 'supplement'),
  (151, '%comprimido%', 'supplement'),
  (152, '%vitamina%', 'supplement'),
  (153, '%mineral%', 'supplement'),
  (154, '%probiotico%', 'supplement'),
  (155, '%omega%', 'supplement'),
  (156, '%melatonina%', 'supplement'),
  (157, '%creatina%', 'supplement'),
  (158, '%jalea real%', 'supplement'),
  (159, '%propolis%', 'supplement'),
  (160, '%valeriana%', 'supplement'),
  (161, '%colagen%', 'supplement'),
  (170, '%vaselina%', 'first-aid'),
  (171, '%arnica%', 'first-aid'),
  (172, '%balsamo%', 'first-aid'),
  (173, '%parafarmacia%', 'first-aid'),
  (174, '%fitoterapia%', 'first-aid');

UPDATE product_categories
SET
  icon_key = 'first-aid',
  updated_at = '2026-08-14T00:00:00.000Z'
WHERE normalized_name LIKE '%parafarmacia%'
  OR normalized_name LIKE '%fitoterapia%';

UPDATE product_categories
SET
  icon_key = 'coffee',
  updated_at = '2026-08-14T00:00:00.000Z'
WHERE normalized_name LIKE '%cafe%'
  OR normalized_name LIKE '%infusion%';

UPDATE product_categories
SET
  icon_key = CASE
    WHEN normalized_name LIKE '%agua%' THEN 'water'
    WHEN normalized_name LIKE '%refresco%' THEN 'soft-drink'
    WHEN normalized_name LIKE '%bebida%' THEN 'drink'
    ELSE icon_key
  END,
  updated_at = '2026-08-14T00:00:00.000Z'
WHERE normalized_name LIKE '%agua%'
  OR normalized_name LIKE '%refresco%'
  OR normalized_name LIKE '%bebida%';

UPDATE product_catalog
SET
  icon_key = (
    SELECT icon_key
    FROM _catalog_icon_rules
    WHERE product_catalog.normalized_name LIKE text_like
    ORDER BY rule_order
    LIMIT 1
  ),
  updated_at = '2026-08-14T00:00:00.000Z'
WHERE is_active = 1
  AND EXISTS (
    SELECT 1
    FROM _catalog_icon_rules
    WHERE product_catalog.normalized_name LIKE text_like
  );

DROP TABLE _catalog_icon_rules;
