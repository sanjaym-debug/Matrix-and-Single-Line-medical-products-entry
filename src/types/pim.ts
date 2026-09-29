export interface RawSupplierRow {
  id: string;
  mpn: string;
  brand: string;
  vendorName: string;
  purchasePrice: number | string;
  rawProductName: string;
  rawUom: string;
  rawQuantity?: number;
  indemedItemId: string;
  mckessonId?: string;
  mckessonUom?: string;
  familyGroup?: string;
}

export const PIM_SCHEMA_COLUMNS = [
  'SKU',
  'Subitem Of',
  'MPN',
  'Purchase Price',
  'BRAND',
  'Vendor',
  'Product Preferred Vendor',
  'PRODUCT NAME',
  'Unit Type',
  'Uom to Each',
  'Stock Description',
  'Indemed Item #',
  'Indemed UOM',
  'Mckesson ID',
  'Mckesson UOM',
  'Shipping Category',
  'Shipping Rate',
  'Logo Free Shipping',
  'Item Attribute Set',
  'G shopping',
  'Item Commerce Category',
  'Avatax Taxcode',
  'Google Product Category',
  'Item Manager',
  'Category',
] as const;

export type PIMColumnKey = (typeof PIM_SCHEMA_COLUMNS)[number];

export interface RuleAuditStep {
  ruleNumber: number;
  ruleName: string;
  inputSummary: string;
  outputSummary: string;
  status: 'verified' | 'enriched' | 'enforced';
}

export interface GroundingCitation {
  title: string;
  uri: string;
}

export interface PIMOutputRow {
  id: string;
  rowType: 'matrix-parent' | 'matrix-child' | 'single-item';
  rawSourceId?: string;
  // Exact 25 PIM Schema Columns
  'SKU': string;
  'Subitem Of': string;
  'MPN': string;
  'Purchase Price': string;
  'BRAND': string;
  'Vendor': string;
  'Product Preferred Vendor': string;
  'PRODUCT NAME': string;
  'Unit Type': string;
  'Uom to Each': string;
  'Stock Description': string;
  'Indemed Item #': string;
  'Indemed UOM': string;
  'Mckesson ID': string;
  'Mckesson UOM': string;
  'Shipping Category': string;
  'Shipping Rate': string;
  'Logo Free Shipping': string;
  'Item Attribute Set': string;
  'G shopping': string;
  'Item Commerce Category': string;
  'Avatax Taxcode': string;
  'Google Product Category': string;
  'Item Manager': string;
  'Category': string;
  // Audit & Research Metadata (UI inspection only, omitted from 25-column export)
  _auditTrail: RuleAuditStep[];
  _rawProductName?: string;
  _researchSource: 'manufacturer-kb' | 'google-search-grounding' | 'heuristic-normalizer';
  _researchNotes: string;
  _citations?: GroundingCitation[];
}

export interface ResearchedProductSpec {
  mpn: string;
  brand: string;
  familyKey?: string;
  parentTitle?: string;
  officialNameWithAttributes: string;
  defaultUnitCode: string;
  defaultMultiplier: number;
  categoryPath: string;
  attributeSet: string;
  avataxCode: string;
  shippingCategory: string;
  researchNotes: string;
  citations?: GroundingCitation[];
  source?: 'manufacturer-kb' | 'google-search-grounding';
}

export interface PipelineConfig {
  itemManager: string;
  independenceMedicalRate: string;
  defaultOtherVendorRate: string;
  emptyVendorFieldToken: 'NaN' | '';
  gShoppingDefault: 'Yes' | 'No';
  logoFreeShippingDefault: 'No' | 'Yes';
  enableMatrixGrouping: boolean;
}
