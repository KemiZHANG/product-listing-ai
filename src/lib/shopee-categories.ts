export type ShopeeCategoryNode = {
  name: string
  id?: string
  children?: ShopeeCategoryNode[]
}

export const SHOPEE_CATEGORY_ATTRIBUTE_KEY = '__shopee_category'

export type ShopeeCategorySelection = {
  path: string[]
  id?: string
}

function leaf(name: string, id?: string): ShopeeCategoryNode {
  return id ? { name, id } : { name }
}

export const SHOPEE_CATEGORY_TREE: ShopeeCategoryNode[] = [
  {
    name: 'Beauty',
    children: [
      {
        name: 'Hand, Foot & Nail Care',
        children: [
          { name: 'Hand Care', children: [leaf('Hand Masks', '101607'), leaf('Lotion, Cream & Scrubs', '101608'), leaf('Hand Washes', '101609')] },
          { name: 'Foot Care', children: [leaf('Foot Deodorant', '101611'), leaf('Foot Masks', '101612'), leaf('Lotion, Cream & Scrubs', '101613')] },
          { name: 'Nail Care', children: [leaf('Base & Top Coat', '101615'), leaf('Nail Polish', '102029'), leaf('Nail Polish Remover', '102030'), leaf('Nail Treatment', '102031'), leaf('Artificial Nail', '102032'), leaf('Nail Art & Sticker', '102033'), leaf('Manicure Tools & Devices', '102034'), leaf('Nail Gel', '102178')] },
        ],
      },
      { name: 'Hair Care', children: [leaf('Shampoo', '100869'), leaf('Hair Colour', '100870'), leaf('Hair Treatment', '100871'), leaf('Hair and Scalp Conditioner', '100872'), leaf('Hair Styling', '100873')] },
      { name: "Men's Care", children: [
        leaf('Bath & Body Care', '100875'),
        { name: 'Skincare', children: [leaf('Facial Cleanser', '101616'), leaf('Moisturizer & Treatment', '101617')] },
        { name: 'Shaving & Grooming', children: [leaf('Aftershave', '101619'), leaf('Creams, Foams & Gels', '101620'), leaf('Razors & Blades', '101621'), leaf('Trimmers, Clippers & Multi-functional Groomers'), leaf('Shaving Accessories')] },
        leaf('Hair Care'),
      ] },
      leaf('Perfumes & Fragrances'),
      { name: 'Makeup', children: [
        { name: 'Face', children: [leaf('Makeup Base & Primer'), leaf('Foundation'), leaf('BB & CC Cream'), leaf('Powder'), leaf('Concealer & Corrector'), leaf('Bronzer, Contour & Highlighter'), leaf('Setting & Finishing Spray'), leaf('Blush')] },
        { name: 'Eyes', children: [leaf('Eyeshadow'), leaf('Eye Primer'), leaf('Eyeliner'), leaf('Mascara'), leaf('Eyebrows')] },
        { name: 'Lips', children: [leaf('Lipstick'), leaf('Lip Gloss'), leaf('Lip Liner'), leaf('Lip Tint & Stain'), leaf('Lip Plumper')] },
        leaf('Makeup Removers'),
      ] },
      { name: 'Beauty Tools', children: [
        { name: 'Makeup Accessories', children: [leaf('Cotton Pads and Buds'), leaf('Makeup Bags & Organizers'), leaf('Mirrors'), leaf('Makeup Brush Cleaners'), leaf('Makeup Brushes'), leaf('Sponges & Applicators'), leaf('Eyelash Curlers'), leaf('Eyebrow Templates'), leaf('False Eyelashes'), leaf('Eyelid Tape & Glue'), leaf('Pencil Sharpeners')] },
        { name: 'Facial Care Tools', children: [leaf('Facial Steamers'), leaf('Facial Slimming & Massage Tools'), leaf('Facial Cleansing Tools')] },
        leaf('Body Slimming Tools'),
        leaf('Hair Removal Tools'),
        { name: 'Hair Tools', children: [leaf('Brushes & Combs'), leaf('Hair Dryers'), leaf('Hair Styling Appliances'), leaf('Heatless Styling Tools'), leaf('Others')] },
        leaf('Others'),
      ] },
      { name: 'Skincare', children: [
        leaf('Facial Cleanser'), leaf('Toner'), leaf('Facial Moisturizer'), leaf('Facial Oil'), leaf('Facial Mist'), leaf('Facial Serum & Essence'), leaf('Face Scrub & Peel'), leaf('Face Mask & Packs'),
        { name: 'Eye Treatment', children: [leaf('Eye Cream'), leaf('Eye Mask & Packs')] },
        { name: 'Lip Treatment', children: [leaf('Lip Balm'), leaf('Lip Scrub & Exfoliator'), leaf('Lip Mask')] },
        leaf('Face Sunscreen'), leaf('After Sun Face Care'), leaf('Blotting Paper'), leaf('Acne Treatment'),
      ] },
      leaf('Beauty Sets & Packages'),
      { name: 'Bath & Body Care', children: [leaf('Body Wash & Soap'), leaf('Body Scrub & Peel'), leaf('Body Masks'), leaf('Body Oil'), leaf('Body Cream, Lotion & Butter'), leaf('Body Deodorants'), leaf('Massage Oil'), leaf('Hair Removal Cream & Wax'), { name: 'Sun Care', children: [leaf('Body Sunscreen & After Sun'), leaf('Tanning Oil & Self Tanners')] }] },
    ],
  },
  {
    name: 'Health',
    children: [
      { name: 'Food Supplement', children: [leaf('Weight Management'), leaf('Beauty Supplements'), leaf('Fitness'), leaf('Well Being')] },
      { name: 'Medical Supplies', children: [
        leaf('Traditional Medicine'),
        { name: 'Health Monitors & Tests', children: [leaf('Blood Pressure Monitors'), leaf('Blood Glucose Monitors'), leaf('Pulse Oximeters'), leaf('Thermometers'), leaf('Others')] },
        leaf('Scale & Body Fat Analyzers'), leaf('Nasal Care'),
        { name: 'First Aid Supplies', children: [leaf('Plasters & Bandages'), leaf('First Aid Accessories'), leaf('Ointments & Creams'), leaf('Medical Antiseptics & Disinfectants')] },
        leaf('Stethoscopes'), leaf('Pain Relievers'), leaf('Laboratory Tools'), leaf('Medical Gloves & Masks'),
        { name: 'Injury & Disability Support', children: [leaf('Walking Aids'), leaf('Wheelchairs'), leaf('Braces & Supports'), leaf('Hearing Aids')] },
      ] },
      { name: 'Personal Care', children: [
        leaf('Hand Sanitizers'),
        { name: 'Eye Care', children: [leaf('Contact lens'), leaf('Lens Solutions & Eyedrops'), leaf('Others')] },
        leaf('Ear Care'),
        { name: 'Oral Care', children: [leaf('Manual Toothbrushes'), leaf('Electric Toothbrushes & Accessories'), leaf('Toothpastes'), leaf('Mouth Wash'), leaf('Denture Care'), leaf('Teeth Whitening'), leaf('Orthodontic Accessories'), leaf('Others')] },
        leaf('Adult Diapers & Incontinence'),
        { name: 'Feminine Care', children: [leaf('Sanitary Napkins & Panty Liners'), leaf('Tampons'), leaf('Pregnancy & Fertility Tests'), leaf('Menstrual Cup'), leaf('Feminine Wash'), leaf('Vaginal Cream')] },
        leaf('Massage & Therapy Devices'), leaf('Insect Repellents'),
      ] },
      { name: 'Sexual Wellness', children: [leaf('Condoms'), leaf('Lubricants')] },
    ],
  },
  {
    name: 'Food & Beverage',
    children: [
      { name: 'Convenience / Ready-to-eat', children: [leaf('Cooked Food'), leaf('Instant Rice & Porridge'), leaf('Instant Hotpot'), leaf('Instant Noodles')] },
      { name: 'Snacks', children: [leaf('Sweets & Candies'), leaf('Chocolate'), leaf('Chips & Crisps'), leaf('Seeds'), leaf('Popcorn'), leaf('Seaweed'), leaf('Nuts'), leaf('Pudding, Jellies & Marshmallow'), { name: 'Dried Snacks', children: [leaf('Meat Jerky and Bakkwa'), leaf('Dried Fruits'), leaf('Meat Floss'), leaf('Seafood Snacks')] }] },
      { name: 'Food Staples', children: [
        { name: 'Dried Goods', children: [leaf('Beans & Grains'), leaf('Dried Seafood'), leaf('Traditional Herbs')] },
        leaf('Noodles'), leaf('Rice'), leaf('Pasta'),
        { name: 'Canned Food', children: [leaf('Canned Fruits'), leaf('Canned Meat'), leaf('Canned Seafood'), leaf('Canned Vegetables'), leaf('Canned Soup')] },
        leaf('Preserved Vegetables'),
      ] },
      { name: 'Cooking Essentials', children: [
        leaf('Oil'),
        { name: 'Seasonings & Condiments', children: [leaf('Pepper'), leaf('Salt'), leaf('Herbs & Spices'), leaf('Sauce'), leaf('Chilli & Sambal'), leaf('Vinegar'), leaf('Cooking Wine'), leaf('Dressing')] },
        leaf('Sugar'), leaf('Sweetener'), leaf('Stock, Gravy & Instant Soup'), leaf('Cooking Paste & Kit'), leaf('Flavour Enhancers'), leaf('Flour Coating'),
      ] },
      { name: 'Baking Needs', children: [leaf('Baking Flavoring'), leaf('Baking Powder & Soda'), leaf('Baking Premix Flour'), leaf('Flour'), leaf('Food Coloring'), leaf('Baking decoration')] },
      { name: 'Breakfast Cereals & Spread', children: [leaf('Honey & Maple Syrups'), leaf('Jam & Spread'), leaf('Cereal, Granola & Oats'), leaf('Breakfast Bar')] },
      { name: 'Beverages', children: [leaf('Coffee'), leaf('Tea & Tea Bags'), leaf('Chocolate Drinks'), leaf('Energy & Isotonic Drinks'), leaf('Water'), leaf('Juice & Juice Vinegar'), leaf('Cordial & Syrups'), leaf('Carbonated Drinks & Tonics'), leaf('Powdered Drink Mixes'), leaf('Dessert Drink'), leaf('Traditional & Herbal Drinks'), leaf('Drink Toppings'), leaf('Non-dairy Milk')] },
      { name: 'Dairy & Eggs', children: [{ name: 'Milk', children: [leaf('Fresh Milk'), leaf('UHT Milk'), leaf('Condensed & Evaporated Milk'), leaf('Powdered Milk')] }, leaf('Yogurt & Cultured Milk'), leaf('Creamers'), leaf('Butter & Margarine'), leaf('Cheese & Cheese Powder'), leaf('Ice cream'), leaf('Eggs'), leaf('Beancurd')] },
      { name: 'Fresh & Frozen Food', children: [{ name: 'Meat', children: [leaf('Beef'), leaf('Poultry'), leaf('Pork'), leaf('Lamb')] }, { name: 'Seafood', children: [leaf('Fish'), leaf('Prawn'), leaf('Crab')] }, leaf('Vegetarian Meat'), { name: 'Vegetables', children: [leaf('Cabbage & Brussel Sprouts'), leaf('Leafy Vegetables')] }, leaf('Mushroom'), leaf('Frozen Processed Food'), leaf('Processed Meat & Seafood')] },
      { name: 'Bakery', children: [leaf('Breads'), leaf('Cakes & Pies'), leaf('Pastry')] },
      leaf('Gift Set & Hampers'),
    ],
  },
  {
    name: 'Mom & Baby',
    children: [
      { name: 'Baby Travel Essentials', children: [leaf('Baby Carrier'), leaf('Strollers & Travel Systems'), leaf('Stroller Accessories'), leaf('Car & Motorbike Seats'), leaf('Car & Motorbike Seats Accessories'), leaf('Diaper Bags'), leaf('Child Harnesses & Leashes')] },
      { name: 'Feeding Essentials', children: [{ name: 'Bottle-feeding', children: [leaf('Bottle Cooler Bag'), leaf('Bottles & Bottle accessories'), leaf('Bottle Cleansing'), leaf('Warmers'), leaf('Sterilizers')] }, { name: 'Breastfeeding', children: [leaf('Breast Pump & Accessories'), leaf('Breast Pads, Shells & Shields'), leaf('Nursing Covers'), leaf('Breastmilk Storage Bags')] }, leaf('Highchairs & Booster Seats'), { name: 'Utensils', children: [leaf('Baby Cups'), leaf('Baby Tableware'), leaf('Baby Food Containers')] }, leaf('Bibs'), leaf('Pacifiers'), leaf('Food Processors')] },
      { name: 'Maternity Accessories', children: [leaf('Supporting Belts'), leaf('Maternity Pillows')] },
      { name: 'Maternity Healthcare', children: [leaf('Maternity Milk'), leaf('Maternity Vitamins & Supplement'), leaf('Moisturizers & Creams')] },
      { name: 'Bath & Body Care', children: [leaf('Bathing Tubs & Seats'), leaf('Bath Robes, Towels & Wash Cloths'), leaf('Shower Caps'), leaf('Bathing Tools & Accessories'), leaf('Hair Care & Body Wash'), leaf('Baby Colognes & Fragrances'), leaf('Baby Grooming Tools'), leaf('Wipes'), leaf('Baby Laundry Detergent')] },
      { name: 'Nursery', children: [leaf('Cribs & Cradles & Beds'), leaf('Bouncers, Rockers & Jumpers'), leaf('Walkers'), { name: 'Mattresses & Bedding', children: [leaf('Blankets & Wrappers'), leaf('Pillows & Bolsters'), leaf('Bedsheets')] }, leaf('Storage & Organization')] },
      { name: 'Baby Safety', children: [leaf('Monitors'), leaf('Mosquito Netting'), leaf('Bumpers, Rails & Guards'), leaf('Edge & Corner Guards'), leaf('Baby Gates & Doorways'), leaf('Safety Locks & Straps')] },
      { name: 'Milk Formula & Baby Food', children: [leaf('Milk Formula'), leaf('Baby Porridge, Puree & Cereal'), leaf('Baby Snack')] },
      { name: 'Baby Healthcare', children: [leaf('Baby Vitamins & Supplements'), leaf('Nasal Care'), { name: 'Baby Skincare', children: [leaf('Lotion & Creams'), leaf('Oils'), leaf('Powders')] }, leaf('Baby Oral Care'), leaf('Sun Care')] },
      { name: 'Diapering & Potty', children: [leaf('Changing Pads & Kits'), leaf('Potty Training & Commode Chairs'), leaf('Disposable Diapers'), leaf('Cloth Diapers & Accessories')] },
      { name: 'Toys', children: [{ name: 'Baby & Toddler Toys', children: [leaf('Playgym & Playmats'), leaf('Playards & Playpens'), leaf('Bath Toys'), leaf('Crib Mobiles & Rattles'), leaf('Teethers')] }, leaf('Block Toys'), { name: 'Dolls & Stuffed Toys', children: [leaf('Dolls & Accessories'), leaf('Doll Houses & Accessories'), leaf('Stuffed Toys')] }, leaf('Pretend Play'), leaf('Toy Vehicles'), { name: 'Sports & Outdoor Play', children: [leaf('Bicycles, Scooters & Ride-ons'), leaf('Inflatables & Slides'), leaf('Play Tents, Tunnels & Ball Pits'), leaf('Pool, Water & Sand Toys'), leaf('Blasters & Toy Guns'), leaf('Sports Toys'), leaf('Flying Toys, Kites & Wind Spinners')] }, { name: 'Educational Toys', children: [leaf('Arts & Crafts'), leaf('Math Toys'), leaf('Science & Tech Toys'), leaf('Shape Sorters'), leaf('Puzzles'), leaf('Musical Toys'), leaf('Toy Tablets & Computers')] }, leaf('Robot Toys'), leaf('Slime & Squishy Toys')] },
      leaf('Gift Sets & Packages'),
    ],
  },
  {
    name: 'Home & Living',
    children: [
      { name: 'Home Fragrance & Aromatherapy', children: [leaf('Air Fresheners & Home Fragrance'), leaf('Essential Oils'), leaf('Diffusers, Humidifiers & Oil Burners')] },
      { name: 'Bathrooms', children: [
        leaf('Toilet Bowls, Seats & Covers'),
        leaf('Toothbrush Holders & Toothpaste Dispensers'),
        leaf('Soap Dispensers, Holders & Boxes'),
        leaf('Bathroom Racks & Cabinets'),
        leaf('Bathtubs'),
        { name: 'Towels & Bathrobes', children: [leaf('Bath Towels'), leaf('Face & Hand Towels'), leaf('Bath Robes'), leaf('Others')] },
        leaf('Showerheads & Bidet Sprays'),
        leaf('Bath Brushes & Loofahs'),
        leaf('Shower Curtains'),
        leaf('Shower Seats & Commodes'),
        leaf('Safety Handles'),
        leaf('Shower Caps'),
        leaf('Others'),
      ] },
      { name: 'Bedding', children: [leaf('Cooling Mats'), leaf('Mattress Protectors & Toppers'), leaf('Blankets, Comforters & Quilts'), leaf('Pillows'), leaf('Bedsheets, Pillowcases & Bolster Cases'), leaf('Matresses'), leaf('Mosquito Nets'), leaf('Bolsters'), leaf('Others')] },
      { name: 'Decoration', children: [leaf('Flowers'), leaf('Furniture & Appliance Covers'), leaf('Curtains & Blinds'), leaf('Photo Frames & Wall Decoration'), leaf('Wallpapers & Wall Stickers'), leaf('Clocks'), leaf('Floor Mats'), leaf('Carpets & Rugs'), leaf('Vases & Vessels'), leaf('Candles & Candleholders'), leaf('Mirrors'), leaf('Table Cloths'), leaf('Others')] },
      leaf('Hand Warmers, Hot Water Bags & Ice Bags'),
      { name: 'Furniture', children: [leaf('Cushions'), leaf('Doorstoppers'), leaf('Bed Frames & Headboards'), leaf('Desks & Tables'), leaf('Wardrobes'), leaf('Benches, Chairs & Stools'), leaf('Sofas'), leaf('Cupboards & Cabinets'), leaf('Shelves & Racks')] },
      { name: 'Gardening', children: [leaf('Plants'), leaf('Garden Decorations'), leaf('Garden Soils & Growing Media'), leaf('Fertilizer'), leaf('Seeds & Bulbs'), leaf('Pots & Planters'), leaf('Irrigation Systems'), leaf('Gardening Tools'), leaf('Others'), leaf('Lawn Mowers')] },
      { name: 'Tools & Home Improvement', children: [
        leaf('Industrial Adhesives & Tapes'),
        leaf('Protective Gloves, Goggles & Masks'),
        leaf('Sinks & Water Taps'),
        leaf('Roofing & Flooring'),
        leaf('Wall Paints & Coatings'),
        { name: 'Tools', children: [leaf('Tool Boxes'), leaf('Measuring Tapes'), leaf('Spanner Sets'), leaf('Hammers'), leaf('Pliers'), leaf('Nails, Screws & Fasteners'), leaf('Drills, Screwdrivers & Accessories'), leaf('Saws, Cut-off Machines & Grinders'), leaf('Pressure Washers'), leaf('Power Generators'), leaf('Electrical Testers & Multimeters'), leaf('Levels & Measuring Wheels'), leaf('Rangefinders'), leaf('Air Compressors'), leaf('Sandpaper, Power Sanders & Accessories'), leaf('Power Welding Tools'), leaf('Blowers'), leaf('Others')] },
        leaf('Water Pumps, Parts & Accessories'),
        leaf('Air Pumps, Parts & Accessories'),
        leaf('Ladders'),
        leaf('Trollies'),
        leaf('Shades, Awnings & Tarpaulins'),
        leaf('Construction Materials'),
        leaf('Doors & Windows'),
        leaf('Others'),
      ] },
      { name: 'Home Care Supplies', children: [
        leaf('Clotheslines & Drying Racks'),
        leaf('Cleaning Brushes'),
        leaf('Brooms'),
        leaf('Dusters'),
        leaf('Mops'),
        leaf('Basins, Buckets & Water Dippers'),
        leaf('Sponges & Scouring Pads'),
        leaf('Trash & Recycling Bins'),
        leaf('Plastic Bags & Trash Bags'),
        leaf('Cleaning Cloths'),
        leaf('Pest & Weed Control'),
        leaf('Tissue & Paper Towels'),
        leaf('Toilet Paper'),
        leaf('Cleaning Agents'),
        { name: 'Laundry Care', children: [leaf('Fabric Fragrances'), leaf('Fabric Conditioners & Softeners'), leaf('Detergents'), leaf('Others')] },
      ] },
      { name: 'Kitchenware', children: [leaf('Grills & Accessories'), leaf('Bakewares & Decorations'), leaf('Pans'), leaf('Pots'), leaf('Food Storage'), leaf('Cling Wrap'), leaf('Aluminium Foil'), leaf('Tea, Coffee & Bartending Equipments'), leaf('Kitchen Racks'), leaf('Aprons & Kitchen Gloves'), leaf('Spatulas & Cooking Tweezers'), leaf('Chopping Boards'), leaf('Knives & Kitchen Scissors'), leaf('Whisks & Beaters'), leaf('Can & Bottle Openers'), leaf('Measuring Glasses & Spoons'), leaf('Strainers'), leaf('Graters, Peelers & Cutters'), leaf('Kitchen Weighing Scales'), leaf('Sealers'), leaf('Lighters, Matches & Fire Starters'), leaf('Others')] },
      { name: 'Dinnerware', children: [leaf('Jugs, Pitchers & Accessories'), leaf('Tea Pots & Sets'), leaf('Cups, Mugs & Glasses'), leaf('Water Bottles & Accessories'), leaf('Bowls'), leaf('Plates'), leaf('Cutleries'), leaf('Straws'), leaf('Food Covers'), leaf('Placemats & Coasters'), leaf('Others')] },
      leaf('Lighting'),
      { name: 'Safety & Security', children: [leaf('Safes'), leaf('Fire Fighting Equipments'), leaf('Door Hardware & Locks')] },
      { name: 'Home Organizers', children: [leaf('Hangers & Pegs'), leaf('Storage Boxes, Bags & Baskets'), leaf('Shoe Storage Boxes'), leaf('Hooks'), leaf('Laundry Bags & Baskets'), leaf('Desk Organizers'), leaf('Wardrobe Organizers'), leaf('Jewelry Organizers'), leaf('Tissue Holders'), leaf('Others')] },
      { name: 'Party Supplies', children: [leaf('Balloons'), leaf('Wooden Clips'), leaf('Backdrops & Banners'), leaf('Cards'), leaf('Disposable Tableware'), leaf('Party Hats & Masks'), leaf('Sashes'), leaf('Others')] },
      leaf('Fengshui & Religious Supplies'),
    ],
  },
]

export function encodeShopeeCategorySelection(selection: ShopeeCategorySelection | null) {
  if (!selection || selection.path.length === 0) return ''
  return JSON.stringify(selection)
}

export function decodeShopeeCategorySelection(value: unknown): ShopeeCategorySelection | null {
  if (!value) return null
  if (typeof value === 'object' && !Array.isArray(value)) {
    const selection = value as Partial<ShopeeCategorySelection>
    return Array.isArray(selection.path) ? { path: selection.path.map(String), id: selection.id ? String(selection.id) : undefined } : null
  }
  if (typeof value !== 'string') return null
  try {
    const parsed = JSON.parse(value) as Partial<ShopeeCategorySelection>
    return Array.isArray(parsed.path) ? { path: parsed.path.map(String), id: parsed.id ? String(parsed.id) : undefined } : null
  } catch {
    const path = value.split('>').map((item) => item.trim()).filter(Boolean)
    return path.length > 0 ? { path } : null
  }
}

export function formatShopeeCategorySelection(selection: ShopeeCategorySelection | null | undefined) {
  if (!selection?.path.length) return ''
  return `${selection.path.join(' > ')}${selection.id ? ` (${selection.id})` : ''}`
}
