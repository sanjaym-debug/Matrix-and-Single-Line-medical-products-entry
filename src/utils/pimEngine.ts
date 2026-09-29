import {
  RawSupplierRow,
  PIMOutputRow,
  ResearchedProductSpec,
  PipelineConfig,
  RuleAuditStep,
  PIM_SCHEMA_COLUMNS,
} from '../types/pim';
import {
  MANUFACTURER_KNOWLEDGE_BASE,
  UOM_FULL_NAME_MAP,
  UOM_SHORT_CODE_MAP,
} from '../data/catalogData';

export function getBrandPrefix(brand: string): string {
  const cleaned = (brand || '').replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  if (cleaned.length >= 2) return cleaned.slice(0, 2);
  if (cleaned.length === 1) return `${cleaned}X`;
  return 'XX';
}

export function normalizeUomCode(rawUom: string, rawProductName?: string): {
  shortCode: string;
  fullUnitName: string;
  extractedMultiplier: number;
} {
  let cleanRaw = (rawUom || 'EA').trim().toUpperCase();
  let multiplierFromUom = 0;

  // Handle combined UOM strings like "100/BG" or "50/BX" or "1/EA"
  const slashMatch = cleanRaw.match(/^(\d+)\s*\/\s*([A-Z]+)$/);
  if (slashMatch) {
    multiplierFromUom = parseInt(slashMatch[1], 10);
    cleanRaw = slashMatch[2];
  }

  // Also check rawProductName for patterns like "100/BG", "50/BX", "24/CS", "1/EA"
  if (!multiplierFromUom && rawProductName) {
    const titleRatioMatch = rawProductName.toUpperCase().match(/\b(\d+)\s*\/\s*([A-Z]{2,6})\b/);
    if (titleRatioMatch) {
      multiplierFromUom = parseInt(titleRatioMatch[1], 10);
      if (!rawUom || rawUom.trim() === '') {
        cleanRaw = titleRatioMatch[2];
      }
    }
  }

  const shortCode = UOM_SHORT_CODE_MAP[cleanRaw] || cleanRaw.slice(0, 2) || 'EA';
  const fullUnitName = UOM_FULL_NAME_MAP[cleanRaw] || UOM_FULL_NAME_MAP[shortCode] || 'Each';

  const extractedMultiplier =
    shortCode === 'EA' ? 1 : multiplierFromUom > 0 ? multiplierFromUom : 1;

  return {
    shortCode,
    fullUnitName,
    extractedMultiplier,
  };
}

export function cleanMessyVendorTitle(rawTitle: string, brand: string): string {
  if (!rawTitle) return brand || 'Medical Supply Item';

  // Remove trailing quantity/UOM tokens like 100/BG, 50/BX, 1/EA, EA, etc.
  let cleaned = rawTitle
    .replace(/\b\d+\s*\/\s*(EA|EACH|BX|BOX|CS|CASE|BG|BAG|PK|PACK|BT|BTL|RL|KT)\b/gi, '')
    .replace(/\s+(EA|EACH|BX|CS|BG|PK)\s*$/i, '')
    .trim();

  const tokenReplacements: Array<[RegExp, string]> = [
    [/\bCHLD\b/gi, "Children's"],
    [/\bCHILDRENS\b/gi, "Children's"],
    [/\bSUSP\b/gi, 'Suspension'],
    [/\bLIQ\b/gi, 'Liquid'],
    [/\bRET\b/gi, 'Retainer'],
    [/\bDRESS\b/gi, 'Dressing'],
    [/\bWHT\b/gi, 'White'],
    [/\bBLK\b/gi, 'Black'],
    [/\bBLU\b/gi, 'Blue'],
    [/\bGRN\b/gi, 'Green'],
    [/\bRED\b/gi, 'Red'],
    [/\bCHRY\b/gi, 'Cherry'],
    [/\bSURG\b/gi, 'Surgical'],
    [/\bNDL\b/gi, 'Needles'],
    [/\bCATH\b/gi, 'Catheter'],
    [/\bDISP\b/gi, 'Disposable'],
    [/\bCVR\b/gi, 'Covers'],
    [/\bBARR\b/gi, 'Barrier'],
    [/\bBTL\b/gi, 'Bottle'],
    [/\bSYS\b/gi, 'System'],
    [/\bSZ\s*(\d+)\b/gi, 'Size $1'],
    [/\b(\d+)\s*IN\b/gi, '$1 Inch'],
    [/\b(\d+)\s*OZ\b/gi, '$1 oz'],
  ];

  for (const [regex, replacement] of tokenReplacements) {
    cleaned = cleaned.replace(regex, replacement);
  }

  // Convert ALL-CAPS words to Title Case while preserving acronyms like SCD, DVT, 3M, BD, Fr, mg, mL
  const preserveUpper = new Set(['SCD', 'DVT', '3M', 'BD', 'AP', 'OTC', 'IV', 'FR', 'MG', 'ML', 'MM', 'G']);
  cleaned = cleaned
    .split(/\s+/)
    .map((word) => {
      const bare = word.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
      if (preserveUpper.has(bare)) return bare === 'FR' ? 'Fr' : word;
      if (word === word.toUpperCase() && word.length > 1 && /[A-Z]/.test(word)) {
        return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
      }
      return word;
    })
    .join(' ');

  return cleaned.replace(/\s+/g, ' ').trim();
}

export function matchBestCategory(
  searchText: string,
  categoryReferenceList: string[]
): {
  fullCategoryPath: string;
  googleProductCategory: string;
  commerceCategory: string;
} {
  const lower = searchText.toLowerCase();

  const keywordRules: Array<{ keywords: string[]; matchSubstring: string }> = [
    { keywords: ['thermometer', 'probe cover', 'suretemp', '05031'], matchSubstring: 'Thermometer Probes and Covers' },
    { keywords: ['retainer', 'pronet', 'elastic net', 'tubular'], matchSubstring: 'Tubular Elastic Retainer Nets' },
    { keywords: ['tylenol', 'acetaminophen', 'ibuprofen', 'pediatric', 'oral suspension', 'cherry'], matchSubstring: 'Pediatric Analgesics and Antipyretics' },
    { keywords: ['scd', 'sequential compression', 'compression controller', '301230700'], matchSubstring: 'Sequential Compression Devices and Controllers' },
    { keywords: ['ostomy', 'flextend', 'skin barrier', 'flange', 'wafer', 'hollister'], matchSubstring: 'Ostomy Skin Barriers and Flanges' },
    { keywords: ['micropore', 'surgical tape', 'paper tape', 'adhesive strip'], matchSubstring: 'Surgical Tapes and Adhesive Strips' },
    { keywords: ['pen needle', 'lancet', 'nano', 'insulin needle'], matchSubstring: 'Insulin Pen Needles and Safety Lancets' },
    { keywords: ['speedicath', 'intermittent', 'hydrophilic catheter', 'male catheter'], matchSubstring: 'Intermittent Hydrophilic Catheters' },
    { keywords: ['ensure', 'nutrition shake', 'boost', 'glucerna', 'oral supplement'], matchSubstring: 'Oral Therapeutic Nutrition Shakes' },
    { keywords: ['gauze', 'sponge', 'non-adherent'], matchSubstring: 'Gauze Sponges and Non-Adherent Pads' },
    { keywords: ['underpad', 'drypad', 'ultrasorbs', 'chux'], matchSubstring: 'Heavy Absorbency Disposable Underpads' },
    { keywords: ['stethoscope', 'littmann'], matchSubstring: 'Stethoscopes and Acoustic Accessories' },
    { keywords: ['blood pressure', 'sphygmomanometer', 'cuff'], matchSubstring: 'Blood Pressure Monitors and Cuffs' },
    { keywords: ['glove', 'nitrile', 'latex'], matchSubstring: 'Nitrile and Latex Exam Gloves' },
    { keywords: ['nebulizer', 'aerosol'], matchSubstring: 'Aerosol Nebulizer Kits and Tubing' },
  ];

  for (const rule of keywordRules) {
    if (rule.keywords.some((kw) => lower.includes(kw))) {
      const found = categoryReferenceList.find((cat) =>
        cat.toLowerCase().includes(rule.matchSubstring.toLowerCase())
      );
      if (found) {
        const segments = found.split('>').map((s) => s.trim());
        return {
          fullCategoryPath: found,
          googleProductCategory: segments[0] || found,
          commerceCategory: segments[segments.length - 1] || found,
        };
      }
    }
  }

  // Token overlap fallback against Category Reference List
  const words = lower.split(/[^a-z0-9]+/).filter((w) => w.length > 2);
  let bestCat = categoryReferenceList[0] || 'Medical Supplies > General Patient Care';
  let bestScore = -1;

  for (const cat of categoryReferenceList) {
    const catLower = cat.toLowerCase();
    let score = 0;
    for (const w of words) {
      if (catLower.includes(w)) score += 2;
    }
    if (score > bestScore) {
      bestScore = score;
      bestCat = cat;
    }
  }

  const segments = bestCat.split('>').map((s) => s.trim());
  return {
    fullCategoryPath: bestCat,
    googleProductCategory: segments[0] || bestCat,
    commerceCategory: segments[segments.length - 1] || bestCat,
  };
}

export function formatProductNameWithQuantity(
  baseNameWithAttributes: string,
  fullUnitName: string,
  multiplier: number
): string {
  // Strip any existing trailing "- Each" or "- Bag of 100" to prevent duplication
  const cleanBase = baseNameWithAttributes
    .replace(/\s+-\s+(Each|[A-Za-z]+\s+of\s+\d+)\s*$/i, '')
    .trim();

  // Rule 3: Full Quantity Suffix Rule:
  // For items with an Each or single unit quantity, write it out fully as "- Each"
  if (fullUnitName.toLowerCase() === 'each' || multiplier === 1) {
    return `${cleanBase} - Each`;
  }

  // Child variant titles or single-item variant titles must follow the strict format:
  // Name, color, flavor etc - [Packaging Type] of [Quantity]
  return `${cleanBase} - ${fullUnitName} of ${multiplier}`;
}

export function deriveParentTitleFromChildren(childrenTitles: string[], brand: string): string {
  if (childrenTitles.length === 0) return brand;
  // Take first child's clean base name and strip variant-specific size/flavor tail after comma if multiple commas
  const first = childrenTitles[0].replace(/\s+-\s+(Each|[A-Za-z]+\s+of\s+\d+)\s*$/i, '').trim();
  const commaParts = first.split(',').map((p) => p.trim());
  if (commaParts.length >= 2) {
    return commaParts[0];
  }
  return first;
}

export function runPIMTransformationPipeline(
  rawRows: RawSupplierRow[],
  categoryReferenceList: string[],
  config: PipelineConfig,
  customResearchMap: Record<string, ResearchedProductSpec> = {}
): PIMOutputRow[] {
  // Step 1: Enrich each raw row with MPN + Brand research
  const enrichedItems = rawRows.map((raw) => {
    const lookupKey = `${raw.brand.trim().toUpperCase()}::${raw.mpn.trim().toUpperCase()}`;
    const spec =
      customResearchMap[lookupKey] ||
      MANUFACTURER_KNOWLEDGE_BASE[lookupKey];

    const uomInfo = normalizeUomCode(raw.rawUom, raw.rawProductName);
    const multiplier =
      raw.rawQuantity && raw.rawQuantity > 0
        ? raw.rawQuantity
        : uomInfo.shortCode === 'EA'
        ? 1
        : spec?.defaultMultiplier || uomInfo.extractedMultiplier || 1;

    const officialNameWithAttributes =
      spec?.officialNameWithAttributes ||
      cleanMessyVendorTitle(raw.rawProductName, raw.brand);

    const categoryInfo = spec?.categoryPath
      ? (() => {
          // Verify spec category is in reference list or use closest
          const exactMatch = categoryReferenceList.find(
            (c) => c.toLowerCase() === spec.categoryPath.toLowerCase()
          );
          const chosenPath = exactMatch || spec.categoryPath;
          const segments = chosenPath.split('>').map((s) => s.trim());
          return {
            fullCategoryPath: chosenPath,
            googleProductCategory: segments[0] || chosenPath,
            commerceCategory: segments[segments.length - 1] || chosenPath,
          };
        })()
      : matchBestCategory(
          `${raw.brand} ${raw.mpn} ${officialNameWithAttributes}`,
          categoryReferenceList
        );

    // Determine family grouping key
    const familyKey =
      raw.familyGroup?.trim() ||
      spec?.familyKey ||
      '';

    return {
      raw,
      spec,
      lookupKey,
      uomShort: uomInfo.shortCode,
      unitTypeFull: uomInfo.fullUnitName,
      multiplier,
      officialNameWithAttributes,
      categoryInfo,
      familyKey,
    };
  });

  // Step 2: Determine Matrix Groups vs Single Line Items
  const groupCounts = new Map<string, number>();
  for (const item of enrichedItems) {
    const brandUpper = item.raw.brand.trim().toUpperCase();
    const groupIdentifier = item.familyKey
      ? `${brandUpper}::FAM::${item.familyKey.toUpperCase()}`
      : `${brandUpper}::MPN::${item.raw.mpn.trim().toUpperCase()}`;
    groupCounts.set(groupIdentifier, (groupCounts.get(groupIdentifier) || 0) + 1);
  }

  const outputRows: PIMOutputRow[] = [];
  const emittedParentSkus = new Set<string>();

  for (const item of enrichedItems) {
    const {
      raw,
      spec,
      uomShort,
      unitTypeFull,
      multiplier,
      officialNameWithAttributes,
      categoryInfo,
      familyKey,
    } = item;

    const brandClean = spec?.brand || raw.brand.trim();
    const brandPrefix = getBrandPrefix(brandClean);
    const brandUpper = brandClean.toUpperCase();
    const mpnClean = raw.mpn.trim();

    const groupIdentifier = familyKey
      ? `${brandUpper}::FAM::${familyKey.toUpperCase()}`
      : `${brandUpper}::MPN::${mpnClean.toUpperCase()}`;

    const isMatrixMember =
      config.enableMatrixGrouping && (groupCounts.get(groupIdentifier) || 0) > 1;

    const familyBaseMpn = familyKey || mpnClean;
    const parentSku = `${brandPrefix}${familyBaseMpn}-MI`;

    const vendorName = raw.vendorName.trim() || 'Independence Medical';
    const isIndependenceMedical =
      vendorName.toLowerCase().includes('independence medical');
    const shippingRate = isIndependenceMedical
      ? config.independenceMedicalRate
      : config.defaultOtherVendorRate;

    const mckessonIdValue =
      raw.mckessonId && raw.mckessonId.trim() !== ''
        ? raw.mckessonId.trim()
        : config.emptyVendorFieldToken;
    const mckessonUomValue =
      raw.mckessonUom && raw.mckessonUom.trim() !== ''
        ? raw.mckessonUom.trim()
        : config.emptyVendorFieldToken;

    const priceNum =
      typeof raw.purchasePrice === 'number'
        ? raw.purchasePrice
        : parseFloat(String(raw.purchasePrice).replace(/[^0-9.-]/g, '')) || 0;

    // If Matrix Member and parent not yet emitted, emit Parent Matrix (-MI) row first
    if (isMatrixMember && !emittedParentSkus.has(parentSku)) {
      emittedParentSkus.add(parentSku);

      const familySiblings = enrichedItems.filter((sibling) => {
        const sibBrand = (sibling.spec?.brand || sibling.raw.brand.trim()).toUpperCase();
        const sibGroup = sibling.familyKey
          ? `${sibBrand}::FAM::${sibling.familyKey.toUpperCase()}`
          : `${sibBrand}::MPN::${sibling.raw.mpn.trim().toUpperCase()}`;
        return sibGroup === groupIdentifier;
      });

      const parentTitle =
        spec?.parentTitle ||
        deriveParentTitleFromChildren(
          familySiblings.map((s) => s.officialNameWithAttributes),
          brandClean
        );

      const parentAudit: RuleAuditStep[] = [
        {
          ruleNumber: 1,
          ruleName: 'MPN & Brand Family Research',
          inputSummary: `${brandClean} Family ${familyBaseMpn} (${familySiblings.length} variants detected)`,
          outputSummary: `Verified base matrix title: "${parentTitle}"`,
          status: 'verified',
        },
        {
          ruleNumber: 2,
          ruleName: 'Parent Matrix SKU Generation (-MI)',
          inputSummary: `Brand Prefix "${brandPrefix}" + Base Family "${familyBaseMpn}"`,
          outputSummary: `Created Parent Matrix SKU "${parentSku}" to group ${familySiblings.length} child variants`,
          status: 'enforced',
        },
        {
          ruleNumber: 3,
          ruleName: 'Parent Title Formatting',
          inputSummary: parentTitle,
          outputSummary: `Omitted packaging/quantity suffix for Parent Matrix row: "${parentTitle}"`,
          status: 'enforced',
        },
        {
          ruleNumber: 5,
          ruleName: 'Hierarchical Category Mapping',
          inputSummary: parentTitle,
          outputSummary: `Category: "${categoryInfo.fullCategoryPath}" | Root Google Category: "${categoryInfo.googleProductCategory}"`,
          status: 'enriched',
        },
        {
          ruleNumber: 6,
          ruleName: 'Vendor Logistics & Shipping Rule',
          inputSummary: `Vendor: "${vendorName}"`,
          outputSummary: `Shipping Rate set to ${shippingRate} | Item Manager: ${config.itemManager}`,
          status: 'enforced',
        },
      ];

      outputRows.push({
        id: `pim-parent-${parentSku}`,
        rowType: 'matrix-parent',
        'SKU': parentSku,
        'Subitem Of': '',
        'MPN': familyBaseMpn,
        'Purchase Price': priceNum.toFixed(2),
        'BRAND': brandClean,
        'Vendor': vendorName,
        'Product Preferred Vendor': vendorName,
        'PRODUCT NAME': parentTitle,
        'Unit Type': 'Each',
        'Uom to Each': '1',
        'Stock Description': 'Matrix Parent',
        'Indemed Item #': raw.indemedItemId || '',
        'Indemed UOM': uomShort,
        'Mckesson ID': mckessonIdValue,
        'Mckesson UOM': mckessonUomValue,
        'Shipping Category': spec?.shippingCategory || 'Standard Ground',
        'Shipping Rate': shippingRate,
        'Logo Free Shipping': config.logoFreeShippingDefault,
        'Item Attribute Set': spec?.attributeSet || 'Medical Supplies',
        'G shopping': config.gShoppingDefault,
        'Item Commerce Category': categoryInfo.commerceCategory,
        'Avatax Taxcode': spec?.avataxCode || 'PM020100',
        'Google Product Category': categoryInfo.googleProductCategory,
        'Item Manager': config.itemManager,
        'Category': categoryInfo.fullCategoryPath,
        _auditTrail: parentAudit,
        _rawProductName: `Matrix Parent for ${familySiblings.length} variants`,
        _researchSource: spec?.source || (spec ? 'manufacturer-kb' : 'heuristic-normalizer'),
        _researchNotes:
          spec?.researchNotes ||
          `Parent matrix container grouping ${familySiblings.length} child variants under ${parentSku}.`,
        _citations: spec?.citations,
      });
    }

    // Rule 2: Construct Item SKU (with EA Exception!)
    const itemSku =
      uomShort === 'EA'
        ? `${brandPrefix}${mpnClean}`
        : `${brandPrefix}${mpnClean}-${uomShort}`;

    // Rule 3: Construct formatted PRODUCT NAME
    const formattedProductName = formatProductNameWithQuantity(
      officialNameWithAttributes,
      unitTypeFull,
      multiplier
    );

    // Rule 4: Stock Description in format [Quantity]/[Unit]
    const stockDescription = `${multiplier}/${unitTypeFull}`;

    const itemAudit: RuleAuditStep[] = [
      {
        ruleNumber: 1,
        ruleName: 'MPN & Brand Attribute Verification',
        inputSummary: `Brand: "${brandClean}" | MPN: "${mpnClean}" | Raw: "${raw.rawProductName}"`,
        outputSummary: `Normalized base attributes: "${officialNameWithAttributes}"`,
        status: 'verified',
      },
      {
        ruleNumber: 2,
        ruleName: isMatrixMember
          ? 'Child Variant SKU & Subitem Assignment'
          : 'Single Line Item Classification & SKU Rule',
        inputSummary: `BrandPrefix="${brandPrefix}", MPN="${mpnClean}", UOM="${uomShort}"`,
        outputSummary:
          uomShort === 'EA'
            ? `EA Exception enforced (omitted -EA suffix) → SKU: "${itemSku}" | Subitem Of: "${
                isMatrixMember ? parentSku : '(None — Single Item)'
              }"`
            : `Constructed SKU: "${itemSku}" | Subitem Of: "${
                isMatrixMember ? parentSku : '(None — Single Item)'
              }"`,
        status: 'enforced',
      },
      {
        ruleNumber: 3,
        ruleName: 'Product Name & Full Quantity Suffix Formatting',
        inputSummary: `Attributes: "${officialNameWithAttributes}" | Unit: ${unitTypeFull} (${multiplier})`,
        outputSummary: `Formatted Title: "${formattedProductName}"`,
        status: 'enforced',
      },
      {
        ruleNumber: 4,
        ruleName: 'UOM Full-Name & Supplier Identifier Mapping',
        inputSummary: `Raw UOM: "${raw.rawUom}" | Indemed ID: "${raw.indemedItemId}"`,
        outputSummary: `Unit Type: "${unitTypeFull}" | Uom to Each: "${multiplier}" | Stock: "${stockDescription}" | Mckesson: ${mckessonIdValue}`,
        status: 'enforced',
      },
      {
        ruleNumber: 5,
        ruleName: 'Intelligent Category & Root Google Taxonomy Mapping',
        inputSummary: formattedProductName,
        outputSummary: `Category: "${categoryInfo.fullCategoryPath}" → Root Google Category: "${categoryInfo.googleProductCategory}"`,
        status: 'enriched',
      },
      {
        ruleNumber: 6,
        ruleName: 'Conditional Shipping Rate & PIM Metadata',
        inputSummary: `Vendor: "${vendorName}"`,
        outputSummary: isIndependenceMedical
          ? `Independence Medical Rule matched → Shipping Rate explicitly set to ${shippingRate}`
          : `Standard vendor rate applied → Shipping Rate set to ${shippingRate}`,
        status: 'enforced',
      },
    ];

    outputRows.push({
      id: `pim-row-${raw.id}-${itemSku}`,
      rowType: isMatrixMember ? 'matrix-child' : 'single-item',
      rawSourceId: raw.id,
      'SKU': itemSku,
      'Subitem Of': isMatrixMember ? parentSku : '',
      'MPN': mpnClean,
      'Purchase Price': priceNum.toFixed(2),
      'BRAND': brandClean,
      'Vendor': vendorName,
      'Product Preferred Vendor': vendorName,
      'PRODUCT NAME': formattedProductName,
      'Unit Type': unitTypeFull,
      'Uom to Each': String(multiplier),
      'Stock Description': stockDescription,
      'Indemed Item #': raw.indemedItemId,
      'Indemed UOM': uomShort,
      'Mckesson ID': mckessonIdValue,
      'Mckesson UOM': mckessonUomValue,
      'Shipping Category': spec?.shippingCategory || 'Standard Ground',
      'Shipping Rate': shippingRate,
      'Logo Free Shipping': config.logoFreeShippingDefault,
      'Item Attribute Set': spec?.attributeSet || 'Medical Supplies',
      'G shopping': config.gShoppingDefault,
      'Item Commerce Category': categoryInfo.commerceCategory,
      'Avatax Taxcode': spec?.avataxCode || 'PM020100',
      'Google Product Category': categoryInfo.googleProductCategory,
      'Item Manager': config.itemManager,
      'Category': categoryInfo.fullCategoryPath,
      _auditTrail: itemAudit,
      _rawProductName: raw.rawProductName,
      _researchSource: spec?.source || (spec ? 'manufacturer-kb' : 'heuristic-normalizer'),
      _researchNotes:
        spec?.researchNotes ||
        `Normalized via attribute sequence parser and mapped to ${categoryInfo.fullCategoryPath}.`,
      _citations: spec?.citations,
    });
  }

  return outputRows;
}

export function exportPIMToDelimited(
  rows: PIMOutputRow[],
  delimiter: ',' | '\t' = ','
): string {
  const escapeCell = (val: string) => {
    const str = val ?? '';
    if (delimiter === ',') {
      if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    }
    return str.replace(/\t/g, ' ');
  };

  const headerLine = PIM_SCHEMA_COLUMNS.map(escapeCell).join(delimiter);
  const dataLines = rows.map((row) =>
    PIM_SCHEMA_COLUMNS.map((col) => escapeCell(row[col])).join(delimiter)
  );

  return [headerLine, ...dataLines].join('\n');
}

export function parseDelimitedRawFeed(text: string): RawSupplierRow[] {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  if (lines.length < 2) return [];

  const delimiter = lines[0].includes('\t') ? '\t' : ',';

  const splitLine = (line: string): string[] => {
    if (delimiter === '\t') return line.split('\t').map((s) => s.trim());
    const result: string[] = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        inQuotes = !inQuotes;
      } else if (ch === ',' && !inQuotes) {
        result.push(current.trim());
        current = '';
      } else {
        current += ch;
      }
    }
    result.push(current.trim());
    return result;
  };

  const headers = splitLine(lines[0]).map((h) => h.toLowerCase());
  const findIdx = (candidates: string[]) =>
    headers.findIndex((h) => candidates.some((c) => h.includes(c)));

  const mpnIdx = findIdx(['mpn', 'model', 'part']);
  const brandIdx = findIdx(['brand', 'manufacturer', 'mfr']);
  const vendorIdx = findIdx(['vendor', 'supplier']);
  const priceIdx = findIdx(['price', 'cost', 'purchase']);
  const nameIdx = findIdx(['product name', 'title', 'description', 'name']);
  const uomIdx = findIdx(['uom', 'unit']);
  const qtyIdx = findIdx(['qty', 'quantity', 'multiplier', 'uom to each']);
  const indemedIdx = findIdx(['indemed', 'item id', 'item #', 'supplier id']);
  const mckIdIdx = findIdx(['mckesson id', 'mckid']);
  const mckUomIdx = findIdx(['mckesson uom', 'mckuom']);
  const famIdx = findIdx(['family', 'group', 'parent']);

  return lines.slice(1).map((line, idx) => {
    const cols = splitLine(line);
    const get = (i: number, fallback = '') => (i >= 0 && i < cols.length ? cols[i] : fallback);

    const rawQuantityStr = get(qtyIdx, '');
    const parsedQty = parseInt(rawQuantityStr, 10);

    return {
      id: `imported-${Date.now()}-${idx}`,
      mpn: get(mpnIdx, `MPN-${idx + 1}`),
      brand: get(brandIdx, 'Generic'),
      vendorName: get(vendorIdx, 'Independence Medical'),
      purchasePrice: parseFloat(get(priceIdx, '0').replace(/[^0-9.]/g, '')) || 0,
      rawProductName: get(nameIdx, 'Medical Supply Item'),
      rawUom: get(uomIdx, 'EA'),
      rawQuantity: !isNaN(parsedQty) && parsedQty > 0 ? parsedQty : undefined,
      indemedItemId: get(indemedIdx, `IND-${100000 + idx}`),
      mckessonId: get(mckIdIdx, ''),
      mckessonUom: get(mckUomIdx, ''),
      familyGroup: get(famIdx, ''),
    };
  });
}
