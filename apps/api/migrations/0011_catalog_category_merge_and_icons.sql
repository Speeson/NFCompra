DROP TABLE IF EXISTS _catalog_category_merge;
CREATE TABLE _catalog_category_merge (
  source_normalized_name TEXT NOT NULL,
  target_normalized_name TEXT NOT NULL,
  product_name_like TEXT NULL
);

INSERT INTO _catalog_category_merge (source_normalized_name, target_normalized_name, product_name_like) VALUES
  ('panaderia', 'panaderia y pasteleria', NULL),
  ('arroz, pasta y legumbres', 'arroz, legumbres y pasta', NULL),
  ('cafe, cacao e infusiones', 'cacao, cafe e infusiones', NULL),
  ('conservas y platos preparados', 'conservas, caldos y cremas', NULL),
  ('drogueria y limpieza', 'limpieza y hogar', NULL),
  ('perfumeria e higiene', 'cuidado del cabello', '%champu%'),
  ('perfumeria e higiene', 'cuidado facial y corporal', NULL),
  ('pescado', 'marisco y pescado', NULL),
  ('bebidas', 'agua y refrescos', NULL),
  ('huevos', 'huevos, leche y mantequilla', NULL),
  ('fruta', 'fruta y verdura', NULL),
  ('verdura', 'fruta y verdura', NULL),
  ('lacteos', 'charcuteria y quesos', '%queso%'),
  ('lacteos', 'postres y yogures', '%yogur%'),
  ('lacteos', 'huevos, leche y mantequilla', NULL);

WITH product_targets AS (
  SELECT
    product_catalog.id AS old_product_id,
    product_catalog.normalized_name,
    (
      SELECT target.id
      FROM _catalog_category_merge AS merge_rule
      JOIN product_categories AS target ON target.normalized_name = merge_rule.target_normalized_name
      WHERE merge_rule.source_normalized_name = source.normalized_name
        AND (merge_rule.product_name_like IS NULL OR product_catalog.normalized_name LIKE merge_rule.product_name_like)
      ORDER BY merge_rule.product_name_like IS NULL, length(merge_rule.product_name_like) DESC
      LIMIT 1
    ) AS target_category_id
  FROM product_catalog
  JOIN product_categories AS source ON source.id = product_catalog.category_id
  WHERE product_catalog.is_active = 1
    AND source.normalized_name IN (SELECT source_normalized_name FROM _catalog_category_merge)
)
INSERT OR IGNORE INTO user_product_favorites (user_id, product_id, created_at)
SELECT favorites.user_id, existing.id, favorites.created_at
FROM user_product_favorites AS favorites
JOIN product_targets ON product_targets.old_product_id = favorites.product_id
JOIN product_catalog AS existing ON existing.category_id = product_targets.target_category_id
  AND existing.normalized_name = product_targets.normalized_name
  AND existing.is_active = 1
  AND existing.id <> product_targets.old_product_id
WHERE product_targets.target_category_id IS NOT NULL;

DELETE FROM user_product_favorites
WHERE product_id IN (
  WITH product_targets AS (
    SELECT
      product_catalog.id AS old_product_id,
      product_catalog.normalized_name,
      (
        SELECT target.id
        FROM _catalog_category_merge AS merge_rule
        JOIN product_categories AS target ON target.normalized_name = merge_rule.target_normalized_name
        WHERE merge_rule.source_normalized_name = source.normalized_name
          AND (merge_rule.product_name_like IS NULL OR product_catalog.normalized_name LIKE merge_rule.product_name_like)
        ORDER BY merge_rule.product_name_like IS NULL, length(merge_rule.product_name_like) DESC
        LIMIT 1
      ) AS target_category_id
    FROM product_catalog
    JOIN product_categories AS source ON source.id = product_catalog.category_id
    WHERE product_catalog.is_active = 1
      AND source.normalized_name IN (SELECT source_normalized_name FROM _catalog_category_merge)
  )
  SELECT old_product_id
  FROM product_targets
  WHERE target_category_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM product_catalog AS existing
      WHERE existing.category_id = product_targets.target_category_id
        AND existing.normalized_name = product_targets.normalized_name
        AND existing.is_active = 1
        AND existing.id <> product_targets.old_product_id
    )
);

UPDATE product_catalog
SET is_active = 0, updated_at = '2026-08-14T00:00:00.000Z'
WHERE id IN (
  WITH product_targets AS (
    SELECT
      product_catalog.id AS old_product_id,
      product_catalog.normalized_name,
      (
        SELECT target.id
        FROM _catalog_category_merge AS merge_rule
        JOIN product_categories AS target ON target.normalized_name = merge_rule.target_normalized_name
        WHERE merge_rule.source_normalized_name = source.normalized_name
          AND (merge_rule.product_name_like IS NULL OR product_catalog.normalized_name LIKE merge_rule.product_name_like)
        ORDER BY merge_rule.product_name_like IS NULL, length(merge_rule.product_name_like) DESC
        LIMIT 1
      ) AS target_category_id
    FROM product_catalog
    JOIN product_categories AS source ON source.id = product_catalog.category_id
    WHERE product_catalog.is_active = 1
      AND source.normalized_name IN (SELECT source_normalized_name FROM _catalog_category_merge)
  )
  SELECT old_product_id
  FROM product_targets
  WHERE target_category_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM product_catalog AS existing
      WHERE existing.category_id = product_targets.target_category_id
        AND existing.normalized_name = product_targets.normalized_name
        AND existing.is_active = 1
        AND existing.id <> product_targets.old_product_id
    )
);

WITH product_targets AS (
  SELECT
    product_catalog.id AS old_product_id,
    product_catalog.normalized_name,
    (
      SELECT target.id
      FROM _catalog_category_merge AS merge_rule
      JOIN product_categories AS target ON target.normalized_name = merge_rule.target_normalized_name
      WHERE merge_rule.source_normalized_name = source.normalized_name
        AND (merge_rule.product_name_like IS NULL OR product_catalog.normalized_name LIKE merge_rule.product_name_like)
      ORDER BY merge_rule.product_name_like IS NULL, length(merge_rule.product_name_like) DESC
      LIMIT 1
    ) AS target_category_id
  FROM product_catalog
  JOIN product_categories AS source ON source.id = product_catalog.category_id
  WHERE product_catalog.is_active = 1
    AND source.normalized_name IN (SELECT source_normalized_name FROM _catalog_category_merge)
)
UPDATE product_catalog
SET
  category_id = (SELECT target_category_id FROM product_targets WHERE old_product_id = product_catalog.id),
  updated_at = '2026-08-14T00:00:00.000Z'
WHERE id IN (
  SELECT old_product_id
  FROM product_targets
  WHERE target_category_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
      FROM product_catalog AS existing
      WHERE existing.category_id = product_targets.target_category_id
        AND existing.normalized_name = product_targets.normalized_name
        AND existing.is_active = 1
        AND existing.id <> product_targets.old_product_id
    )
);

DELETE FROM product_categories
WHERE normalized_name IN (SELECT source_normalized_name FROM _catalog_category_merge)
  AND NOT EXISTS (
    SELECT 1
    FROM product_catalog
    WHERE product_catalog.category_id = product_categories.id
      AND product_catalog.is_active = 1
  );

DROP TABLE IF EXISTS _catalog_icon_rules;
CREATE TABLE _catalog_icon_rules (
  rule_order INTEGER PRIMARY KEY,
  text_like TEXT NOT NULL,
  icon_key TEXT NOT NULL
);

INSERT INTO _catalog_icon_rules (rule_order, text_like, icon_key) VALUES
  (10, '%arroz%', 'rice'),
  (20, '%macarron%', 'pasta'),
  (21, '%espagueti%', 'pasta'),
  (22, '%tallar%', 'pasta'),
  (23, '%pasta%', 'pasta'),
  (30, '%alubia%', 'beans'),
  (31, '%judia%', 'beans'),
  (32, '%garbanzo%', 'beans'),
  (33, '%lenteja%', 'beans'),
  (34, '%legumbre%', 'beans'),
  (40, '%cacao%', 'chocolate'),
  (41, '%chocolate%', 'chocolate'),
  (42, '%bombon%', 'chocolate'),
  (50, '%cafe%', 'coffee'),
  (51, '%infusion%', 'coffee'),
  (60, '%salsa%', 'sauce'),
  (61, '%mayonesa%', 'sauce'),
  (62, '%mostaza%', 'sauce'),
  (63, '%ketchup%', 'sauce'),
  (64, '%atun%', 'fish'),
  (65, '%pescado%', 'fish'),
  (66, '%marisco%', 'fish'),
  (70, '%aceite%', 'oil'),
  (71, '%oliva%', 'oil'),
  (72, '%aceituna%', 'oil'),
  (80, '%huevo%', 'egg'),
  (90, '%queso%', 'cheese'),
  (100, '%mantequilla%', 'butter'),
  (110, '%harina%', 'flour'),
  (120, '%sal%', 'salt'),
  (121, '%especia%', 'salt'),
  (122, '%pimienta%', 'salt'),
  (130, '%galleta%', 'cookie'),
  (131, '%cereal%', 'cookie'),
  (140, '%azucar%', 'candy'),
  (141, '%caramelo%', 'candy'),
  (142, '%dulce%', 'candy'),
  (150, '%postre%', 'dessert'),
  (151, '%flan%', 'dessert'),
  (152, '%natilla%', 'dessert'),
  (160, '%helado%', 'frozen'),
  (161, '%congelado%', 'frozen'),
  (170, '%pizza%', 'pizza'),
  (180, '%sopa%', 'soup'),
  (181, '%caldo%', 'soup'),
  (182, '%crema%', 'soup'),
  (200, '%pan%', 'bread'),
  (201, '%bolleria%', 'bread'),
  (210, '%leche%', 'milk'),
  (211, '%lacteo%', 'milk'),
  (212, '%yogur%', 'milk'),
  (220, '%tomate%', 'tomato'),
  (230, '%patata%', 'potato'),
  (231, '%papa%', 'potato'),
  (240, '%cebolla%', 'onion'),
  (250, '%ajo%', 'garlic'),
  (260, '%platano%', 'banana'),
  (261, '%banana%', 'banana'),
  (270, '%naranja%', 'orange'),
  (271, '%mandarina%', 'orange'),
  (280, '%limon%', 'lemon'),
  (290, '%fruta%', 'apple'),
  (291, '%manzana%', 'apple'),
  (300, '%verdura%', 'carrot'),
  (301, '%zanahoria%', 'carrot'),
  (310, '%carne%', 'meat'),
  (311, '%pollo%', 'meat'),
  (320, '%salchicha%', 'cold-cuts'),
  (321, '%chorizo%', 'cold-cuts'),
  (322, '%jamon%', 'cold-cuts'),
  (323, '%charcuteria%', 'cold-cuts'),
  (330, '%agua%', 'bottle'),
  (331, '%bebida%', 'bottle'),
  (332, '%refresco%', 'bottle'),
  (340, '%zumo%', 'juice'),
  (341, '%jugo%', 'juice'),
  (350, '%vino%', 'wine'),
  (351, '%bodega%', 'wine'),
  (360, '%cerveza%', 'beer'),
  (370, '%snack%', 'snack'),
  (371, '%aperitivo%', 'snack'),
  (372, '%patatas fritas%', 'snack'),
  (380, '%papel%', 'paper'),
  (381, '%servilleta%', 'paper'),
  (382, '%panuelo%', 'paper'),
  (390, '%detergente%', 'detergent'),
  (391, '%lavavajillas%', 'detergent'),
  (400, '%limpieza%', 'cleaning'),
  (401, '%drogueria%', 'cleaning'),
  (410, '%higiene%', 'hygiene'),
  (411, '%gel%', 'hygiene'),
  (412, '%champu%', 'hygiene'),
  (413, '%jabon%', 'hygiene'),
  (414, '%cuidado%', 'hygiene'),
  (420, '%maquillaje%', 'makeup'),
  (430, '%mascota%', 'pet'),
  (431, '%perro%', 'pet'),
  (432, '%gato%', 'pet'),
  (440, '%bebe%', 'baby'),
  (450, '%conserva%', 'can');

UPDATE product_categories
SET
  icon_key = (
    SELECT icon_key
    FROM _catalog_icon_rules
    WHERE product_categories.normalized_name LIKE text_like
    ORDER BY rule_order
    LIMIT 1
  ),
  updated_at = '2026-08-14T00:00:00.000Z'
WHERE icon_key IN ('shopping-basket', 'general', 'cart')
  AND EXISTS (
    SELECT 1
    FROM _catalog_icon_rules
    WHERE product_categories.normalized_name LIKE text_like
  );

UPDATE product_catalog
SET
  icon_key = (
    SELECT icon_key
    FROM _catalog_icon_rules
    WHERE product_catalog.normalized_name LIKE text_like
      OR EXISTS (
        SELECT 1
        FROM product_categories
        WHERE product_categories.id = product_catalog.category_id
          AND product_categories.normalized_name LIKE text_like
      )
    ORDER BY rule_order
    LIMIT 1
  ),
  updated_at = '2026-08-14T00:00:00.000Z'
WHERE icon_key IN ('shopping-basket', 'general', 'cart')
  AND EXISTS (
    SELECT 1
    FROM _catalog_icon_rules
    WHERE product_catalog.normalized_name LIKE text_like
      OR EXISTS (
        SELECT 1
        FROM product_categories
        WHERE product_categories.id = product_catalog.category_id
          AND product_categories.normalized_name LIKE text_like
      )
  );

DROP TABLE _catalog_icon_rules;
DROP TABLE _catalog_category_merge;
