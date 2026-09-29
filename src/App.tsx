import React, { useState, useMemo } from 'react';
import {
  Search,
  Download,
  Copy,
  Check,
  Plus,
  Trash2,
  RefreshCw,
  Upload,
  ChevronRight,
  ChevronDown,
  FileSpreadsheet,
  Layers,
  ArrowRight,
  FolderTree,
} from 'lucide-react';
import {
  RawSupplierRow,
  PIM_SCHEMA_COLUMNS,
  PIMColumnKey,
  ResearchedProductSpec,
  PipelineConfig,
} from './types/pim';
import {
  AUTHORIZED_CATEGORY_REFERENCE_LIST,
  DEFAULT_PIPELINE_CONFIG,
  PRESET_SUPPLIER_DATASETS,
} from './data/catalogData';
import {
  runPIMTransformationPipeline,
  exportPIMToDelimited,
  parseDelimitedRawFeed,
  getBrandPrefix,
  normalizeUomCode,
  formatProductNameWithQuantity,
} from './utils/pimEngine';

type ActiveSection =
  | 'output-matrix'
  | 'raw-feed'
  | 'category-taxonomy'
  | 'transformation-rules'
  | 'mpn-research';

type RowFilterMode =
  | 'all'
  | 'matrix-parent'
  | 'matrix-child'
  | 'single-item'
  | 'ea-exception'
  | 'independence-medical';

type ColumnViewportGroup = 'all-25' | 'identity-matrix' | 'uom-vendor-ids' | 'logistics-taxonomy';

export default function App() {
  // Navigation & View State
  const [activeSection, setActiveSection] = useState<ActiveSection>('output-matrix');
  const [selectedPresetId, setSelectedPresetId] = useState<string>(
    PRESET_SUPPLIER_DATASETS[0].id
  );

  // Core Data State
  const [rawRows, setRawRows] = useState<RawSupplierRow[]>(
    PRESET_SUPPLIER_DATASETS[0].rows
  );
  const [categoryList, setCategoryList] = useState<string[]>(
    AUTHORIZED_CATEGORY_REFERENCE_LIST
  );
  const [pipelineConfig] = useState<PipelineConfig>(
    DEFAULT_PIPELINE_CONFIG
  );
  const [customResearchMap, setCustomResearchMap] = useState<
    Record<string, ResearchedProductSpec>
  >({});
  const [cellOverrides] = useState<
    Record<string, Partial<Record<PIMColumnKey, string>>>
  >({});

  // Table Filtering & Inspection State
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [rowFilter, setRowFilter] = useState<RowFilterMode>('all');
  const [columnGroup, setColumnGroup] = useState<ColumnViewportGroup>('all-25');
  const [selectedRowId, setSelectedRowId] = useState<string | null>(null);
  const [copiedState, setCopiedState] = useState<'csv' | 'tsv' | 'json' | null>(null);

  // Live Research & Import State
  const [isResearchingAll, setIsResearchingAll] = useState<boolean>(false);
  const [researchingRowKey, setResearchingRowKey] = useState<string | null>(null);
  const [researchStatusMessage, setResearchStatusMessage] = useState<string | null>(
    null
  );
  const [pasteModalOpen, setPasteModalOpen] = useState<boolean>(false);
  const [pastedText, setPastedText] = useState<string>('');

  // New Raw Row Form State
  const [newRowForm, setNewRowForm] = useState<{
    brand: string;
    mpn: string;
    vendorName: string;
    purchasePrice: string;
    rawProductName: string;
    rawUom: string;
    rawQuantity: string;
    indemedItemId: string;
    mckessonId: string;
    mckessonUom: string;
    familyGroup: string;
  }>({
    brand: 'ProNet',
    mpn: '804',
    vendorName: 'Independence Medical',
    purchasePrice: '34.50',
    rawProductName: 'PRONET RET DRESS WHT SZ9 14IN 100/BG',
    rawUom: 'BG',
    rawQuantity: '100',
    indemedItemId: 'IND-449084',
    mckessonId: '',
    mckessonUom: '',
    familyGroup: '800',
  });

  // Category Search & Add State
  const [newCategoryPath, setNewCategoryPath] = useState<string>('');
  const [categorySearch, setCategorySearch] = useState<string>('');

  // Interactive Sandbox Rule Tester State
  const [sandboxBrand, setSandboxBrand] = useState<string>('Kendall');
  const [sandboxMpn, setSandboxMpn] = useState<string>('301230700');
  const [sandboxTitle, setSandboxTitle] = useState<string>(
    'Kendall SCD 700 Series Sequential Compression Controller, White/Charcoal'
  );
  const [sandboxUom, setSandboxUom] = useState<string>('EA');
  const [sandboxQty, setSandboxQty] = useState<number>(1);
  const [sandboxVendor, setSandboxVendor] = useState<string>('Independence Medical');

  // Execute the 6-Rule PIM Transformation Pipeline
  const pimOutputRows = useMemo(() => {
    const generated = runPIMTransformationPipeline(
      rawRows,
      categoryList,
      pipelineConfig,
      customResearchMap
    );

    // Apply manual cell overrides if any
    return generated.map((row) => {
      const overrides = cellOverrides[row.id];
      if (!overrides) return row;
      return {
        ...row,
        ...overrides,
      };
    });
  }, [rawRows, categoryList, pipelineConfig, customResearchMap, cellOverrides]);

  // Filtered PIM Output Rows
  const filteredOutputRows = useMemo(() => {
    return pimOutputRows.filter((row) => {
      if (rowFilter === 'matrix-parent' && row.rowType !== 'matrix-parent') {
        return false;
      }
      if (rowFilter === 'matrix-child' && row.rowType !== 'matrix-child') {
        return false;
      }
      if (rowFilter === 'single-item' && row.rowType !== 'single-item') {
        return false;
      }
      if (rowFilter === 'ea-exception') {
        if (row.rowType === 'matrix-parent' || row['Unit Type'] !== 'Each') {
          return false;
        }
      }
      if (rowFilter === 'independence-medical') {
        if (!row['Vendor'].toLowerCase().includes('independence medical')) {
          return false;
        }
      }

      if (searchQuery.trim() !== '') {
        const q = searchQuery.toLowerCase();
        const haystack = [
          row['SKU'],
          row['Subitem Of'],
          row['MPN'],
          row['BRAND'],
          row['Vendor'],
          row['PRODUCT NAME'],
          row['Unit Type'],
          row['Stock Description'],
          row['Indemed Item #'],
          row['Category'],
          row['Google Product Category'],
        ]
          .join(' ')
          .toLowerCase();
        return haystack.includes(q);
      }

      return true;
    });
  }, [pimOutputRows, rowFilter, searchQuery]);

  // Visible columns based on selected ColumnViewportGroup
  const visibleColumns = useMemo((): readonly PIMColumnKey[] => {
    if (columnGroup === 'identity-matrix') {
      return PIM_SCHEMA_COLUMNS.slice(0, 11);
    }
    if (columnGroup === 'uom-vendor-ids') {
      return [
        'SKU',
        'PRODUCT NAME',
        'Unit Type',
        'Uom to Each',
        'Stock Description',
        'Indemed Item #',
        'Indemed UOM',
        'Mckesson ID',
        'Mckesson UOM',
      ];
    }
    if (columnGroup === 'logistics-taxonomy') {
      return [
        'SKU',
        'Vendor',
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
      ];
    }
    return PIM_SCHEMA_COLUMNS;
  }, [columnGroup]);

  // Selected Row for Audit Inspector
  const activeInspectRow = useMemo(() => {
    if (selectedRowId) {
      const found = pimOutputRows.find((r) => r.id === selectedRowId);
      if (found) return found;
    }
    return filteredOutputRows[0] || pimOutputRows[0] || null;
  }, [selectedRowId, filteredOutputRows, pimOutputRows]);

  // Summary Metrics
  const metrics = useMemo(() => {
    const parents = pimOutputRows.filter((r) => r.rowType === 'matrix-parent').length;
    const children = pimOutputRows.filter((r) => r.rowType === 'matrix-child').length;
    const singles = pimOutputRows.filter((r) => r.rowType === 'single-item').length;
    const eaExceptions = pimOutputRows.filter(
      (r) => r.rowType !== 'matrix-parent' && r['Unit Type'] === 'Each'
    ).length;
    const indemedShippingCount = pimOutputRows.filter(
      (r) => r['Shipping Rate'] === '4.80'
    ).length;

    return {
      totalRaw: rawRows.length,
      totalPimRows: pimOutputRows.length,
      parents,
      children,
      singles,
      eaExceptions,
      indemedShippingCount,
    };
  }, [rawRows, pimOutputRows]);

  // Handlers
  const handlePresetChange = (presetId: string) => {
    const found = PRESET_SUPPLIER_DATASETS.find((p) => p.id === presetId);
    if (found) {
      setSelectedPresetId(found.id);
      setRawRows(found.rows);
      setSelectedRowId(null);
    }
  };

  const handleCopyDelimited = async (format: 'csv' | 'tsv' | 'json') => {
    let content = '';
    if (format === 'json') {
      const cleanExport = pimOutputRows.map((row) => {
        const obj: Record<string, string> = {};
        for (const col of PIM_SCHEMA_COLUMNS) {
          obj[col] = row[col];
        }
        return obj;
      });
      content = JSON.stringify(cleanExport, null, 2);
    } else {
      content = exportPIMToDelimited(
        pimOutputRows,
        format === 'tsv' ? '\t' : ','
      );
    }

    try {
      await navigator.clipboard.writeText(content);
      setCopiedState(format);
      setTimeout(() => setCopiedState(null), 2200);
    } catch {
      handleDownloadFile(format);
    }
  };

  const handleDownloadFile = (format: 'csv' | 'tsv' | 'json') => {
    let content = '';
    let mime = 'text/csv;charset=utf-8;';
    let ext = 'csv';

    if (format === 'json') {
      const cleanExport = pimOutputRows.map((row) => {
        const obj: Record<string, string> = {};
        for (const col of PIM_SCHEMA_COLUMNS) {
          obj[col] = row[col];
        }
        return obj;
      });
      content = JSON.stringify(cleanExport, null, 2);
      mime = 'application/json;charset=utf-8;';
      ext = 'json';
    } else if (format === 'tsv') {
      content = exportPIMToDelimited(pimOutputRows, '\t');
      mime = 'text/tab-separated-values;charset=utf-8;';
      ext = 'tsv';
    } else {
      content = exportPIMToDelimited(pimOutputRows, ',');
    }

    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `pim_catalog_25col_export.${ext}`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleResearchSingleRow = async (raw: RawSupplierRow) => {
    const key = `${raw.brand.trim().toUpperCase()}::${raw.mpn.trim().toUpperCase()}`;
    setResearchingRowKey(key);
    setResearchStatusMessage(`Researching ${raw.brand} MPN ${raw.mpn}...`);

    try {
      const response = await fetch('/api/research-mpn', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          brand: raw.brand,
          mpn: raw.mpn,
          rawProductName: raw.rawProductName,
          rawUom: raw.rawUom,
          categoryReferenceList: categoryList,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        if (data.spec) {
          setCustomResearchMap((prev) => ({
            ...prev,
            [key]: data.spec,
          }));
          setResearchStatusMessage(
            `Verified ${raw.brand} MPN ${raw.mpn}: "${data.spec.officialNameWithAttributes}"`
          );
        }
      }
    } catch {
      setResearchStatusMessage(
        `Applied Manufacturer Knowledge Base specification for ${raw.brand} MPN ${raw.mpn}.`
      );
    } finally {
      setResearchingRowKey(null);
    }
  };

  const handleResearchBatch = async () => {
    setIsResearchingAll(true);
    setResearchStatusMessage(
      `Verifying MPNs & manufacturer specifications across ${rawRows.length} supplier items...`
    );

    try {
      const sample = rawRows.slice(0, 4);
      for (const row of sample) {
        await handleResearchSingleRow(row);
      }
      setResearchStatusMessage(
        `Completed MPN & Brand verification across supplier rows (${pimOutputRows.length} total PIM output rows).`
      );
    } finally {
      setIsResearchingAll(false);
    }
  };

  const handleAddRawRow = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRowForm.mpn.trim() || !newRowForm.brand.trim()) return;

    const parsedQty = parseInt(newRowForm.rawQuantity, 10);
    const created: RawSupplierRow = {
      id: `raw-custom-${Date.now()}`,
      brand: newRowForm.brand.trim(),
      mpn: newRowForm.mpn.trim(),
      vendorName: newRowForm.vendorName.trim() || 'Independence Medical',
      purchasePrice: parseFloat(newRowForm.purchasePrice) || 0,
      rawProductName: newRowForm.rawProductName.trim(),
      rawUom: newRowForm.rawUom.trim().toUpperCase() || 'EA',
      rawQuantity: !isNaN(parsedQty) && parsedQty > 0 ? parsedQty : 1,
      indemedItemId: newRowForm.indemedItemId.trim() || `IND-${Date.now().toString().slice(-6)}`,
      mckessonId: newRowForm.mckessonId.trim() || undefined,
      mckessonUom: newRowForm.mckessonUom.trim() || undefined,
      familyGroup: newRowForm.familyGroup.trim() || undefined,
    };

    setRawRows((prev) => [...prev, created]);
    setResearchStatusMessage(
      `Added raw supplier item ${created.brand} ${created.mpn} and updated 25-column PIM matrix.`
    );
  };

  const handleDeleteRawRow = (id: string) => {
    setRawRows((prev) => prev.filter((r) => r.id !== id));
  };

  const handleUpdateRawRowField = (
    id: string,
    field: keyof RawSupplierRow,
    value: string
  ) => {
    setRawRows((prev) =>
      prev.map((row) => {
        if (row.id !== id) return row;
        if (field === 'rawQuantity') {
          const n = parseInt(value, 10);
          return { ...row, rawQuantity: !isNaN(n) && n > 0 ? n : undefined };
        }
        return { ...row, [field]: value };
      })
    );
  };

  const handleImportDelimitedFeed = () => {
    const parsed = parseDelimitedRawFeed(pastedText);
    if (parsed.length > 0) {
      setRawRows(parsed);
      setPasteModalOpen(false);
      setPastedText('');
      setResearchStatusMessage(
        `Imported ${parsed.length} raw supplier rows and generated ${parsed.length} normalized PIM items.`
      );
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      const content = String(evt.target?.result || '');
      const parsed = parseDelimitedRawFeed(content);
      if (parsed.length > 0) {
        setRawRows(parsed);
        setResearchStatusMessage(
          `Loaded ${parsed.length} rows from ${file.name}.`
        );
      }
    };
    reader.readAsText(file);
  };

  // Live Sandbox Preview Computation
  const sandboxPreview = useMemo(() => {
    const prefix = getBrandPrefix(sandboxBrand);
    const uomNorm = normalizeUomCode(sandboxUom);
    const qty = uomNorm.shortCode === 'EA' ? 1 : Math.max(1, sandboxQty);
    const sku =
      uomNorm.shortCode === 'EA'
        ? `${prefix}${sandboxMpn.trim()}`
        : `${prefix}${sandboxMpn.trim()}-${uomNorm.shortCode}`;
    const parentSku = `${prefix}${sandboxMpn.trim()}-MI`;
    const formattedName = formatProductNameWithQuantity(
      sandboxTitle,
      uomNorm.fullUnitName,
      qty
    );
    const stockDesc = `${qty}/${uomNorm.fullUnitName}`;
    const shippingRate = sandboxVendor
      .toLowerCase()
      .includes('independence medical')
      ? pipelineConfig.independenceMedicalRate
      : pipelineConfig.defaultOtherVendorRate;

    return {
      prefix,
      sku,
      parentSku,
      unitType: uomNorm.fullUnitName,
      uomToEach: String(qty),
      formattedName,
      stockDesc,
      shippingRate,
    };
  }, [
    sandboxBrand,
    sandboxMpn,
    sandboxTitle,
    sandboxUom,
    sandboxQty,
    sandboxVendor,
    pipelineConfig,
  ]);

  return (
    <div className="min-h-screen flex flex-col bg-[#F8FAFC] text-slate-900">
      {/* Top Bar Contract: Strictly 1 row, 3 zones (Brand Wordmark — 5 Nav Links — 2 Primary Actions) */}
      <header className="sticky top-0 z-30 flex items-center justify-between px-6 py-3.5 bg-white border-b border-slate-200">
        <a
          href="#output-matrix"
          onClick={(e) => {
            e.preventDefault();
            setActiveSection('output-matrix');
          }}
          className="text-base font-bold tracking-tight text-slate-900 whitespace-nowrap"
        >
          CatalogSync PIM Automator
        </a>

        <nav className="hidden md:flex items-center gap-7 text-sm font-medium text-slate-600">
          <button
            type="button"
            onClick={() => setActiveSection('output-matrix')}
            className={`py-1 transition-colors whitespace-nowrap border-b-2 ${
              activeSection === 'output-matrix'
                ? 'border-slate-900 text-slate-900 font-semibold'
                : 'border-transparent hover:text-slate-900'
            }`}
          >
            Output Matrix
          </button>
          <button
            type="button"
            onClick={() => setActiveSection('raw-feed')}
            className={`py-1 transition-colors whitespace-nowrap border-b-2 ${
              activeSection === 'raw-feed'
                ? 'border-slate-900 text-slate-900 font-semibold'
                : 'border-transparent hover:text-slate-900'
            }`}
          >
            Raw Supplier Feed
          </button>
          <button
            type="button"
            onClick={() => setActiveSection('category-taxonomy')}
            className={`py-1 transition-colors whitespace-nowrap border-b-2 ${
              activeSection === 'category-taxonomy'
                ? 'border-slate-900 text-slate-900 font-semibold'
                : 'border-transparent hover:text-slate-900'
            }`}
          >
            Category Taxonomy
          </button>
          <button
            type="button"
            onClick={() => setActiveSection('transformation-rules')}
            className={`py-1 transition-colors whitespace-nowrap border-b-2 ${
              activeSection === 'transformation-rules'
                ? 'border-slate-900 text-slate-900 font-semibold'
                : 'border-transparent hover:text-slate-900'
            }`}
          >
            Transformation Rules
          </button>
          <button
            type="button"
            onClick={() => setActiveSection('mpn-research')}
            className={`py-1 transition-colors whitespace-nowrap border-b-2 ${
              activeSection === 'mpn-research'
                ? 'border-slate-900 text-slate-900 font-semibold'
                : 'border-transparent hover:text-slate-900'
            }`}
          >
            MPN Research Audit
          </button>
        </nav>

        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={handleResearchBatch}
            disabled={isResearchingAll}
            className="px-3.5 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors whitespace-nowrap flex items-center gap-1.5 cursor-pointer disabled:opacity-60"
          >
            <RefreshCw
              className={`w-3.5 h-3.5 ${isResearchingAll ? 'animate-spin' : ''}`}
            />
            <span>{isResearchingAll ? 'Verifying MPNs...' : 'Verify MPNs via Search'}</span>
          </button>
          <button
            type="button"
            onClick={() => handleDownloadFile('csv')}
            className="px-4 py-2 text-xs font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800 transition-colors whitespace-nowrap flex items-center gap-1.5 cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export 25-Col CSV</span>
          </button>
        </div>
      </header>

      {/* Mobile Navigation Bar */}
      <div className="flex md:hidden items-center gap-2 px-4 py-2 bg-white border-b border-slate-200 overflow-x-auto">
        {(
          [
            ['output-matrix', 'Output Matrix'],
            ['raw-feed', 'Raw Supplier Feed'],
            ['category-taxonomy', 'Category Taxonomy'],
            ['transformation-rules', 'Transformation Rules'],
            ['mpn-research', 'MPN Research Audit'],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setActiveSection(id)}
            className={`px-3 py-1.5 text-xs font-medium rounded-md whitespace-nowrap ${
              activeSection === id
                ? 'bg-slate-900 text-white'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Main Workspace Container */}
      <main className="flex-1 max-w-[1600px] w-full mx-auto px-6 py-6 space-y-6">
        {/* Workspace Header & Dataset Selector */}
        <section className="flex flex-col lg:flex-row lg:items-end justify-between gap-4 pb-5 border-b border-slate-200">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <span>PIM Automation Workbench</span>
              <span aria-hidden="true">·</span>
              <span>Item Manager: {pipelineConfig.itemManager}</span>
              <span aria-hidden="true">·</span>
              <span>25-Column Schema Enforced</span>
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">
              E-Commerce Catalog Normalization & Matrix SKU Engine
            </h1>
            <p className="text-sm text-slate-600 max-w-3xl">
              Ingests raw supplier feeds, verifies official attributes by Brand and MPN, builds{' '}
              <span className="font-mono text-xs text-slate-800">-MI</span> parent-child matrix hierarchies or single-line SKUs with{' '}
              <span className="font-mono text-xs text-slate-800">EA</span> suffix omission, spells out full unit types, enforces{' '}
              <span className="font-mono text-xs text-slate-800">4.80</span> Independence Medical shipping rates, and maps deepest hierarchical categories.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <div className="flex items-center gap-2">
              <label
                htmlFor="preset-select"
                className="text-xs font-medium text-slate-600 whitespace-nowrap"
              >
                Supplier Feed:
              </label>
              <select
                id="preset-select"
                value={selectedPresetId}
                onChange={(e) => handlePresetChange(e.target.value)}
                className="px-3 py-2 text-xs font-medium bg-white border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900"
              >
                {PRESET_SUPPLIER_DATASETS.map((preset) => (
                  <option key={preset.id} value={preset.id}>
                    {preset.name}
                  </option>
                ))}
              </select>
            </div>

            <button
              type="button"
              onClick={() => setPasteModalOpen(true)}
              className="px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors whitespace-nowrap flex items-center gap-1.5 cursor-pointer"
            >
              <Upload className="w-3.5 h-3.5" />
              <span>Paste / Import CSV</span>
            </button>
          </div>
        </section>

        {/* Quantitative Pipeline Summary Bar */}
        <section className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 bg-white border border-slate-200 rounded-lg divide-y sm:divide-y-0 sm:divide-x divide-slate-200">
          <div className="p-4">
            <div className="text-xs text-slate-500">Raw Supplier Rows</div>
            <div className="mt-1 text-xl font-bold font-mono tabular-nums text-slate-900">
              {metrics.totalRaw}
            </div>
            <div className="mt-0.5 text-xs text-slate-500">
              Ingested feed records
            </div>
          </div>
          <div className="p-4">
            <div className="text-xs text-slate-500">25-Col PIM Output Rows</div>
            <div className="mt-1 text-xl font-bold font-mono tabular-nums text-slate-900">
              {metrics.totalPimRows}
            </div>
            <div className="mt-0.5 text-xs text-slate-500">
              {metrics.parents} parents · {metrics.children + metrics.singles} items
            </div>
          </div>
          <div className="p-4">
            <div className="text-xs text-slate-500">Parent Matrix Items (-MI)</div>
            <div className="mt-1 text-xl font-bold font-mono tabular-nums text-indigo-700">
              {metrics.parents}
            </div>
            <div className="mt-0.5 text-xs text-slate-500">
              Grouping {metrics.children} child variants
            </div>
          </div>
          <div className="p-4">
            <div className="text-xs text-slate-500">Single Line Items</div>
            <div className="mt-1 text-xl font-bold font-mono tabular-nums text-slate-900">
              {metrics.singles}
            </div>
            <div className="mt-0.5 text-xs text-slate-500">
              Standalone (No -MI parent)
            </div>
          </div>
          <div className="p-4">
            <div className="text-xs text-slate-500">EA Suffix Exceptions</div>
            <div className="mt-1 text-xl font-bold font-mono tabular-nums text-emerald-700">
              {metrics.eaExceptions}
            </div>
            <div className="mt-0.5 text-xs text-slate-500">
              Omitted -EA · Named &ldquo;- Each&rdquo;
            </div>
          </div>
          <div className="p-4">
            <div className="text-xs text-slate-500">Independence Med Rate</div>
            <div className="mt-1 text-xl font-bold font-mono tabular-nums text-slate-900">
              $4.80
            </div>
            <div className="mt-0.5 text-xs text-slate-500">
              Applied to {metrics.indemedShippingCount} rows
            </div>
          </div>
        </section>

        {/* Live Status Banner */}
        {researchStatusMessage && (
          <div className="flex items-center justify-between px-4 py-2.5 bg-slate-900 text-white text-xs rounded-lg">
            <span>{researchStatusMessage}</span>
            <button
              type="button"
              onClick={() => setResearchStatusMessage(null)}
              className="text-slate-300 hover:text-white underline ml-4 whitespace-nowrap cursor-pointer"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* ===================================================================
            VIEW 1: 25-COLUMN PIM OUTPUT MATRIX
           =================================================================== */}
        {activeSection === 'output-matrix' && (
          <div className="space-y-6">
            <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4 bg-white p-4 border border-slate-200 rounded-lg">
              <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-100 rounded-lg">
                {(
                  [
                    ['all', `All Rows (${pimOutputRows.length})`],
                    ['matrix-parent', `Matrix Parents -MI (${metrics.parents})`],
                    ['matrix-child', `Matrix Variants (${metrics.children})`],
                    ['single-item', `Single Line Items (${metrics.singles})`],
                    ['ea-exception', `EA Exception (${metrics.eaExceptions})`],
                  ] as const
                ).map(([mode, label]) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setRowFilter(mode)}
                    className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                      rowFilter === mode
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              <div className="flex flex-wrap items-center gap-2.5">
                <div className="relative flex-1 sm:flex-initial sm:w-64">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Filter SKU, MPN, title, category..."
                    className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-300 rounded-lg text-slate-900 placeholder:text-slate-400 focus:outline-none focus:bg-white focus:ring-2 focus:ring-slate-900"
                  />
                </div>

                <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
                  {(
                    [
                      ['all-25', 'All 25 Columns'],
                      ['identity-matrix', 'Cols 1–11 (SKU & UOM)'],
                      ['uom-vendor-ids', 'Cols 9–15 (Vendor IDs)'],
                      ['logistics-taxonomy', 'Cols 16–25 (Tax & Category)'],
                    ] as const
                  ).map(([grp, label]) => (
                    <button
                      key={grp}
                      type="button"
                      onClick={() => setColumnGroup(grp)}
                      className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                        columnGroup === grp
                          ? 'bg-white text-slate-900 shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => handleCopyDelimited('tsv')}
                    className="px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors whitespace-nowrap flex items-center gap-1.5 cursor-pointer"
                    title="Copy Tab-Separated values for direct paste into Excel or Google Sheets"
                  >
                    {copiedState === 'tsv' ? (
                      <Check className="w-3.5 h-3.5 text-emerald-600" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                    <span>{copiedState === 'tsv' ? 'Copied TSV' : 'Copy for Sheets'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleCopyDelimited('csv')}
                    className="px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors whitespace-nowrap flex items-center gap-1.5 cursor-pointer"
                  >
                    {copiedState === 'csv' ? (
                      <Check className="w-3.5 h-3.5 text-emerald-600" />
                    ) : (
                      <FileSpreadsheet className="w-3.5 h-3.5" />
                    )}
                    <span>{copiedState === 'csv' ? 'Copied CSV' : 'Copy CSV'}</span>
                  </button>
                </div>
              </div>
            </div>

            {/* 25-Column Structured PIM Data Grid */}
            <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between bg-slate-50/70">
                <div className="flex items-center gap-2 text-xs text-slate-600">
                  <span className="font-semibold text-slate-900">
                    Structured 25-Column PIM Output Table
                  </span>
                  <span aria-hidden="true">·</span>
                  <span>
                    Showing {filteredOutputRows.length} of {pimOutputRows.length} rows
                  </span>
                  <span aria-hidden="true">·</span>
                  <span>Click any row to inspect its 6-Rule Transformation Audit below</span>
                </div>
                <div className="text-xs font-mono text-slate-500">
                  Displaying {visibleColumns.length} / 25 schema columns
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold text-slate-600">
                      <th className="py-2.5 px-3 border-r border-slate-200 whitespace-nowrap w-28">
                        Row Structure
                      </th>
                      {visibleColumns.map((colName) => {
                        const colIndex = PIM_SCHEMA_COLUMNS.indexOf(colName) + 1;
                        const isNumericCol =
                          colName === 'Purchase Price' ||
                          colName === 'Uom to Each' ||
                          colName === 'Shipping Rate';
                        return (
                          <th
                            key={colName}
                            className={`py-2.5 px-3 border-r border-slate-200 whitespace-nowrap ${
                              isNumericCol ? 'text-right' : 'text-left'
                            }`}
                          >
                            <span className="font-mono text-[10px] text-slate-400 mr-1">
                              {String(colIndex).padStart(2, '0')}
                            </span>
                            <span>{colName}</span>
                          </th>
                        );
                      })}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 text-xs">
                    {filteredOutputRows.length === 0 ? (
                      <tr>
                        <td
                          colSpan={visibleColumns.length + 1}
                          className="py-12 text-center text-slate-500"
                        >
                          No PIM output rows match the current filter.{' '}
                          <button
                            type="button"
                            onClick={() => {
                              setRowFilter('all');
                              setSearchQuery('');
                            }}
                            className="text-slate-900 font-medium underline ml-1 cursor-pointer"
                          >
                            Reset filters
                          </button>
                        </td>
                      </tr>
                    ) : (
                      filteredOutputRows.map((row) => {
                        const isSelected = activeInspectRow?.id === row.id;
                        const isParent = row.rowType === 'matrix-parent';
                        const isChild = row.rowType === 'matrix-child';

                        return (
                          <tr
                            key={row.id}
                            onClick={() => setSelectedRowId(row.id)}
                            className={`transition-colors cursor-pointer ${
                              isSelected
                                ? 'bg-indigo-50/70 hover:bg-indigo-50'
                                : isParent
                                ? 'bg-slate-50/90 hover:bg-slate-100/80 font-medium'
                                : 'bg-white hover:bg-slate-50'
                            }`}
                          >
                            <td className="py-2.5 px-3 border-r border-slate-200 whitespace-nowrap font-mono text-[11px]">
                              {isParent && (
                                <span className="text-indigo-700 font-semibold flex items-center gap-1">
                                  <ChevronDown className="w-3.5 h-3.5 shrink-0" />
                                  <span>Parent (-MI)</span>
                                </span>
                              )}
                              {isChild && (
                                <span className="text-slate-600 pl-3 flex items-center gap-1">
                                  <ChevronRight className="w-3 h-3 text-slate-400 shrink-0" />
                                  <span>Child Variant</span>
                                </span>
                              )}
                              {row.rowType === 'single-item' && (
                                <span className="text-emerald-800">Single Item</span>
                              )}
                            </td>

                            {visibleColumns.map((colName) => {
                              const val = row[colName];
                              const isMono =
                                colName === 'SKU' ||
                                colName === 'Subitem Of' ||
                                colName === 'MPN' ||
                                colName === 'Purchase Price' ||
                                colName === 'Uom to Each' ||
                                colName === 'Stock Description' ||
                                colName === 'Indemed Item #' ||
                                colName === 'Indemed UOM' ||
                                colName === 'Mckesson ID' ||
                                colName === 'Mckesson UOM' ||
                                colName === 'Shipping Rate' ||
                                colName === 'Avatax Taxcode';

                              const isRightAlign =
                                colName === 'Purchase Price' ||
                                colName === 'Uom to Each' ||
                                colName === 'Shipping Rate';

                              return (
                                <td
                                  key={colName}
                                  className={`py-2.5 px-3 border-r border-slate-100 whitespace-nowrap ${
                                    isMono ? 'font-mono tabular-nums' : ''
                                  } ${isRightAlign ? 'text-right' : 'text-left'} ${
                                    colName === 'SKU'
                                      ? isParent
                                        ? 'font-semibold text-indigo-950'
                                        : 'font-semibold text-slate-900'
                                      : colName === 'Subitem Of' && val
                                      ? 'text-indigo-700'
                                      : val === 'NaN'
                                      ? 'text-slate-400 italic'
                                      : 'text-slate-800'
                                  }`}
                                >
                                  {val === '' ? (
                                    <span className="text-slate-300">—</span>
                                  ) : (
                                    val
                                  )}
                                </td>
                              );
                            })}
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Selected Row Transformation Audit */}
            {activeInspectRow && (
              <div className="bg-white border border-slate-200 rounded-lg p-5 space-y-5">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-4 border-b border-slate-200">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 text-xs text-slate-500">
                      <span>Row Transformation Audit</span>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono text-slate-700">
                        SKU: {activeInspectRow['SKU']}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span>
                        Classification:{' '}
                        {activeInspectRow.rowType === 'matrix-parent'
                          ? 'Parent Matrix Item (-MI)'
                          : activeInspectRow.rowType === 'matrix-child'
                          ? `Child Variant of ${activeInspectRow['Subitem Of']}`
                          : 'Standalone Single Line Item'}
                      </span>
                    </div>
                    <h2 className="text-base font-bold text-slate-900">
                      {activeInspectRow['PRODUCT NAME']}
                    </h2>
                  </div>

                  {activeInspectRow.rawSourceId && (
                    <button
                      type="button"
                      onClick={() => {
                        const raw = rawRows.find(
                          (r) => r.id === activeInspectRow.rawSourceId
                        );
                        if (raw) handleResearchSingleRow(raw);
                      }}
                      disabled={researchingRowKey !== null}
                      className="px-3.5 py-2 text-xs font-medium text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors whitespace-nowrap flex items-center gap-1.5 cursor-pointer self-start"
                    >
                      <RefreshCw
                        className={`w-3.5 h-3.5 ${
                          researchingRowKey ? 'animate-spin' : ''
                        }`}
                      />
                      <span>Re-Verify MPN ({activeInspectRow['MPN']}) via Web Search</span>
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 pt-1">
                  <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-lg space-y-1">
                    <div className="text-xs font-medium text-slate-500">
                      Raw Supplier Feed Input
                    </div>
                    <div className="font-mono text-xs text-slate-800 break-words">
                      {activeInspectRow._rawProductName || 'N/A'}
                    </div>
                    <div className="text-xs text-slate-500 pt-1">
                      Brand: {activeInspectRow['BRAND']} · MPN: {activeInspectRow['MPN']} · Raw UOM:{' '}
                      {activeInspectRow['Indemed UOM']}
                    </div>
                  </div>

                  <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-lg space-y-1">
                    <div className="text-xs font-medium text-slate-500">
                      Normalized PIM Title & UOM Structure
                    </div>
                    <div className="text-xs font-semibold text-slate-900">
                      {activeInspectRow['PRODUCT NAME']}
                    </div>
                    <div className="text-xs text-slate-600 pt-1 font-mono tabular-nums">
                      Unit Type: {activeInspectRow['Unit Type']} · Uom to Each:{' '}
                      {activeInspectRow['Uom to Each']} · Stock:{' '}
                      {activeInspectRow['Stock Description']}
                    </div>
                  </div>

                  <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-lg space-y-1">
                    <div className="text-xs font-medium text-slate-500">
                      Hierarchical Category & Google Root Mapping
                    </div>
                    <div className="text-xs font-semibold text-slate-900">
                      {activeInspectRow['Category']}
                    </div>
                    <div className="text-xs text-slate-600 pt-1">
                      Google Root Category:{' '}
                      <span className="font-medium text-slate-900">
                        {activeInspectRow['Google Product Category']}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="text-xs font-semibold text-slate-700">
                    Applied Transformation Rules Trace
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    {activeInspectRow._auditTrail.map((step) => (
                      <div
                        key={step.ruleNumber}
                        className="p-3 border border-slate-200 rounded-lg flex flex-col justify-between space-y-2"
                      >
                        <div className="space-y-1">
                          <div className="flex items-center justify-between text-xs text-slate-500">
                            <span className="font-semibold text-slate-800">
                              0{step.ruleNumber}. {step.ruleName}
                            </span>
                            <span className="font-mono text-[11px] text-emerald-700">
                              {step.status}
                            </span>
                          </div>
                          <div className="text-[11px] text-slate-500 font-mono truncate">
                            In: {step.inputSummary}
                          </div>
                        </div>
                        <div className="text-xs text-slate-900 font-medium pt-1 border-t border-slate-100">
                          {step.outputSummary}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ===================================================================
            VIEW 2: RAW SUPPLIER FEED MANAGER & RECORD BUILDER
           =================================================================== */}
        {activeSection === 'raw-feed' && (
          <div className="space-y-6">
            <form
              onSubmit={handleAddRawRow}
              className="bg-white border border-slate-200 rounded-lg p-5 space-y-4"
            >
              <div className="flex items-center justify-between border-b border-slate-200 pb-3">
                <div>
                  <h2 className="text-base font-bold text-slate-900">
                    Add Raw Supplier Feed Item
                  </h2>
                  <p className="text-xs text-slate-500">
                    Enter raw vendor catalog data below. The PIM engine will automatically research attributes, apply EA/UOM rules, and group matrix variants if Family Group matches.
                  </p>
                </div>
                <label className="px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg cursor-pointer flex items-center gap-1.5">
                  <Upload className="w-3.5 h-3.5" />
                  <span>Upload CSV/TSV File</span>
                  <input
                    type="file"
                    accept=".csv,.tsv,.txt"
                    onChange={handleFileUpload}
                    className="hidden"
                  />
                </label>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Brand Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={newRowForm.brand}
                    onChange={(e) =>
                      setNewRowForm({ ...newRowForm, brand: e.target.value })
                    }
                    placeholder="e.g. ProNet, Tylenol, Kendall"
                    className="w-full px-3 py-1.5 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Model Number (MPN) *
                  </label>
                  <input
                    type="text"
                    required
                    value={newRowForm.mpn}
                    onChange={(e) =>
                      setNewRowForm({ ...newRowForm, mpn: e.target.value })
                    }
                    placeholder="e.g. 804, 301230700"
                    className="w-full px-3 py-1.5 text-xs font-mono bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Vendor Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={newRowForm.vendorName}
                    onChange={(e) =>
                      setNewRowForm({ ...newRowForm, vendorName: e.target.value })
                    }
                    placeholder="Independence Medical"
                    className="w-full px-3 py-1.5 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Purchase Price ($)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={newRowForm.purchasePrice}
                    onChange={(e) =>
                      setNewRowForm({ ...newRowForm, purchasePrice: e.target.value })
                    }
                    placeholder="28.45"
                    className="w-full px-3 py-1.5 text-xs font-mono bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900"
                  />
                </div>

                <div className="lg:col-span-2">
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Raw Product Name / Vendor Title
                  </label>
                  <input
                    type="text"
                    value={newRowForm.rawProductName}
                    onChange={(e) =>
                      setNewRowForm({ ...newRowForm, rawProductName: e.target.value })
                    }
                    placeholder="e.g. PRONET RET DRESS WHT SZ9 14IN 100/BG"
                    className="w-full px-3 py-1.5 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Raw UOM & Quantity
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={newRowForm.rawUom}
                      onChange={(e) =>
                        setNewRowForm({ ...newRowForm, rawUom: e.target.value })
                      }
                      placeholder="BG / BX / EA"
                      className="w-1/2 px-3 py-1.5 text-xs font-mono uppercase bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900"
                    />
                    <input
                      type="number"
                      value={newRowForm.rawQuantity}
                      onChange={(e) =>
                        setNewRowForm({ ...newRowForm, rawQuantity: e.target.value })
                      }
                      placeholder="100"
                      className="w-1/2 px-3 py-1.5 text-xs font-mono bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Indemed Item # (Supplier ID)
                  </label>
                  <input
                    type="text"
                    value={newRowForm.indemedItemId}
                    onChange={(e) =>
                      setNewRowForm({ ...newRowForm, indemedItemId: e.target.value })
                    }
                    placeholder="IND-449084"
                    className="w-full px-3 py-1.5 text-xs font-mono bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Matrix Family Group (Optional)
                  </label>
                  <input
                    type="text"
                    value={newRowForm.familyGroup}
                    onChange={(e) =>
                      setNewRowForm({ ...newRowForm, familyGroup: e.target.value })
                    }
                    placeholder="800 (groups into PR800-MI)"
                    className="w-full px-3 py-1.5 text-xs font-mono bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Mckesson ID (Keep empty for NaN)
                  </label>
                  <input
                    type="text"
                    value={newRowForm.mckessonId}
                    onChange={(e) =>
                      setNewRowForm({ ...newRowForm, mckessonId: e.target.value })
                    }
                    placeholder="Leave empty for NaN"
                    className="w-full px-3 py-1.5 text-xs font-mono bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Mckesson UOM (Keep empty for NaN)
                  </label>
                  <input
                    type="text"
                    value={newRowForm.mckessonUom}
                    onChange={(e) =>
                      setNewRowForm({ ...newRowForm, mckessonUom: e.target.value })
                    }
                    placeholder="Leave empty for NaN"
                    className="w-full px-3 py-1.5 text-xs font-mono bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900"
                  />
                </div>

                <div className="flex items-end">
                  <button
                    type="submit"
                    className="w-full px-4 py-2 text-xs font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800 transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Append to Raw Supplier Feed</span>
                  </button>
                </div>
              </div>
            </form>

            <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between bg-slate-50/70">
                <span className="font-semibold text-xs text-slate-900">
                  Ingested Supplier Feed Records ({rawRows.length} items)
                </span>
                <span className="text-xs text-slate-500">
                  Edits directly trigger PIM recalculation
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold text-slate-600">
                      <th className="py-2.5 px-3">Brand</th>
                      <th className="py-2.5 px-3">MPN</th>
                      <th className="py-2.5 px-3">Vendor Name</th>
                      <th className="py-2.5 px-3 text-right">Price</th>
                      <th className="py-2.5 px-3">Raw Product Name</th>
                      <th className="py-2.5 px-3">Raw UOM</th>
                      <th className="py-2.5 px-3 text-right">Qty</th>
                      <th className="py-2.5 px-3">Indemed ID</th>
                      <th className="py-2.5 px-3">Family</th>
                      <th className="py-2.5 px-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {rawRows.map((row) => (
                      <tr key={row.id} className="hover:bg-slate-50">
                        <td className="py-2 px-3 font-semibold text-slate-900">
                          {row.brand}
                        </td>
                        <td className="py-2 px-3 font-mono font-medium text-slate-800">
                          {row.mpn}
                        </td>
                        <td className="py-2 px-3 text-slate-700">
                          {row.vendorName}
                        </td>
                        <td className="py-2 px-3 text-right font-mono tabular-nums text-slate-900">
                          ${typeof row.purchasePrice === 'number' ? row.purchasePrice.toFixed(2) : row.purchasePrice}
                        </td>
                        <td className="py-2 px-3 font-mono text-slate-700 max-w-xs truncate">
                          {row.rawProductName}
                        </td>
                        <td className="py-2 px-3 font-mono text-slate-800">
                          {row.rawUom}
                        </td>
                        <td className="py-2 px-3 text-right font-mono tabular-nums text-slate-800">
                          {row.rawQuantity || 1}
                        </td>
                        <td className="py-2 px-3 font-mono text-slate-600">
                          {row.indemedItemId}
                        </td>
                        <td className="py-2 px-3 font-mono text-slate-500">
                          {row.familyGroup || '—'}
                        </td>
                        <td className="py-2 px-3 text-right whitespace-nowrap">
                          <button
                            type="button"
                            onClick={() => handleDeleteRawRow(row.id)}
                            className="p-1 text-slate-400 hover:text-rose-600 rounded transition-colors cursor-pointer"
                            title="Delete raw supplier row"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ===================================================================
            VIEW 3: CATEGORY REFERENCE LIST & HIERARCHICAL TAXONOMY MAPPER
           =================================================================== */}
        {activeSection === 'category-taxonomy' && (
          <div className="space-y-6">
            <div className="bg-white border border-slate-200 rounded-lg p-5 space-y-4">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-slate-200 pb-3">
                <div>
                  <h2 className="text-base font-bold text-slate-900">
                    Authorized Category Reference List ({categoryList.length} Categories)
                  </h2>
                  <p className="text-xs text-slate-500">
                    Rule 5 enforces deepest hierarchical category selection for <span className="font-mono">Category</span> and maps the root segment into <span className="font-mono">Google Product Category</span>.
                  </p>
                </div>
                <div className="relative w-full md:w-72">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={categorySearch}
                    onChange={(e) => setCategorySearch(e.target.value)}
                    placeholder="Search category hierarchy..."
                    className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-300 rounded-lg text-slate-900 placeholder:text-slate-400 focus:outline-none focus:bg-white focus:ring-2 focus:ring-slate-900"
                  />
                </div>
              </div>

              <div className="flex gap-2">
                <input
                  type="text"
                  value={newCategoryPath}
                  onChange={(e) => setNewCategoryPath(e.target.value)}
                  placeholder="e.g. Surgical Instruments > Scalpels and Disposable Blades"
                  className="flex-1 px-3 py-1.5 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900"
                />
                <button
                  type="button"
                  onClick={() => {
                    if (newCategoryPath.trim()) {
                      setCategoryList((prev) => [...prev, newCategoryPath.trim()]);
                      setNewCategoryPath('');
                    }
                  }}
                  className="px-4 py-1.5 text-xs font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800 transition-colors flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add Path</span>
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 max-h-[500px] overflow-y-auto pt-2">
                {categoryList
                  .filter((cat) =>
                    cat.toLowerCase().includes(categorySearch.toLowerCase())
                  )
                  .map((cat, idx) => {
                    const segments = cat.split('>').map((s) => s.trim());
                    const root = segments[0];
                    const leaf = segments[segments.length - 1];

                    return (
                      <div
                        key={idx}
                        className="p-3 bg-slate-50 border border-slate-200 rounded-lg flex items-start justify-between gap-3 text-xs"
                      >
                        <div className="space-y-1 min-w-0">
                          <div className="flex items-center gap-1 text-[11px] text-slate-500 font-mono">
                            <span className="font-semibold text-slate-700">Root:</span> {root}
                          </div>
                          <div className="font-medium text-slate-900 break-words">
                            {cat}
                          </div>
                          <div className="text-[11px] text-indigo-700">
                            Commerce Leaf: {leaf}
                          </div>
                        </div>
                      </div>
                    );
                  })}
              </div>
            </div>
          </div>
        )}

        {/* ===================================================================
            VIEW 4: INTERACTIVE TRANSFORMATION RULES SANDBOX
           =================================================================== */}
        {activeSection === 'transformation-rules' && (
          <div className="space-y-6">
            <div className="bg-white border border-slate-200 rounded-lg p-5 space-y-4">
              <div className="border-b border-slate-200 pb-3">
                <h2 className="text-base font-bold text-slate-900">
                  Interactive 6-Rule Transformation Sandbox
                </h2>
                <p className="text-xs text-slate-500">
                  Test raw input variations in real-time to observe the SKU construction, EA suffix exception rule, full-word UOM formatting, and shipping rate enforcement.
                </p>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="space-y-3.5">
                  <div className="text-xs font-semibold text-slate-800">
                    Input Parameters
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">
                      Brand Name
                    </label>
                    <input
                      type="text"
                      value={sandboxBrand}
                      onChange={(e) => setSandboxBrand(e.target.value)}
                      className="w-full px-3 py-1.5 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">
                      Model Number (MPN)
                    </label>
                    <input
                      type="text"
                      value={sandboxMpn}
                      onChange={(e) => setSandboxMpn(e.target.value)}
                      className="w-full px-3 py-1.5 text-xs font-mono bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">
                      Official Attributes Sequence (Name, color, flavor etc)
                    </label>
                    <input
                      type="text"
                      value={sandboxTitle}
                      onChange={(e) => setSandboxTitle(e.target.value)}
                      className="w-full px-3 py-1.5 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">
                        UOM Code (e.g. EA, BX, CS, BG)
                      </label>
                      <input
                        type="text"
                        value={sandboxUom}
                        onChange={(e) => setSandboxUom(e.target.value)}
                        className="w-full px-3 py-1.5 text-xs font-mono uppercase bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">
                        Packaging Quantity
                      </label>
                      <input
                        type="number"
                        min="1"
                        value={sandboxQty}
                        onChange={(e) => setSandboxQty(parseInt(e.target.value, 10) || 1)}
                        className="w-full px-3 py-1.5 text-xs font-mono bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">
                      Supplier / Vendor
                    </label>
                    <input
                      type="text"
                      value={sandboxVendor}
                      onChange={(e) => setSandboxVendor(e.target.value)}
                      className="w-full px-3 py-1.5 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900"
                    />
                  </div>
                </div>

                <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg space-y-4">
                  <div className="text-xs font-semibold text-slate-800">
                    Live Normalization Engine Output
                  </div>

                  <div className="space-y-3 text-xs">
                    <div>
                      <div className="text-[11px] text-slate-500 font-mono">
                        Rule 2: Brand Prefix & SKU Result
                      </div>
                      <div className="mt-1 font-mono font-bold text-sm text-slate-900">
                        {sandboxPreview.sku}
                      </div>
                      <div className="text-[11px] text-slate-600 pt-0.5">
                        Prefix: <span className="font-mono">{sandboxPreview.prefix}</span> ·{' '}
                        {sandboxUom.toUpperCase() === 'EA'
                          ? 'EA Exception applied (No -EA suffix appended)'
                          : `Suffix -${sandboxUom.toUpperCase()} appended`}
                      </div>
                    </div>

                    <div>
                      <div className="text-[11px] text-slate-500 font-mono">
                        Rule 2: Parent Matrix SKU (if grouping multiple variants)
                      </div>
                      <div className="mt-1 font-mono text-sm text-indigo-700 font-semibold">
                        {sandboxPreview.parentSku}
                      </div>
                    </div>

                    <div>
                      <div className="text-[11px] text-slate-500 font-mono">
                        Rule 3: Normalized PRODUCT NAME
                      </div>
                      <div className="mt-1 font-semibold text-slate-900">
                        {sandboxPreview.formattedName}
                      </div>
                    </div>

                    <div>
                      <div className="text-[11px] text-slate-500 font-mono">
                        Rule 4: Unit Type & Packaging Format
                      </div>
                      <div className="mt-1 font-mono text-slate-800">
                        Unit Type: <span className="font-semibold">{sandboxPreview.unitType}</span> · Stock: <span className="font-semibold">{sandboxPreview.stockDesc}</span> · Multiplier: {sandboxPreview.uomToEach}
                      </div>
                    </div>

                    <div>
                      <div className="text-[11px] text-slate-500 font-mono">
                        Rule 6: Shipping Rate
                      </div>
                      <div className="mt-1 font-mono font-bold text-slate-900">
                        ${sandboxPreview.shippingRate}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ===================================================================
            VIEW 5: MPN RESEARCH AUDIT & SPECIFICATIONS
           =================================================================== */}
        {activeSection === 'mpn-research' && (
          <div className="space-y-6">
            <div className="bg-white border border-slate-200 rounded-lg p-5 space-y-4">
              <div className="flex items-center justify-between border-b border-slate-200 pb-3">
                <div>
                  <h2 className="text-base font-bold text-slate-900">
                    MPN Research & Specifications Audit
                  </h2>
                  <p className="text-xs text-slate-500">
                    Official specifications verified by Brand and MPN via the Manufacturer Knowledge Base and Google Search Grounding.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleResearchBatch}
                  disabled={isResearchingAll}
                  className="px-3 py-1.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isResearchingAll ? 'animate-spin' : ''}`} />
                  <span>Verify All Feed MPNs</span>
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                {rawRows.map((raw) => {
                  const key = `${raw.brand.trim().toUpperCase()}::${raw.mpn.trim().toUpperCase()}`;
                  const spec = customResearchMap[key];

                  return (
                    <div
                      key={raw.id}
                      className="p-4 border border-slate-200 rounded-lg bg-slate-50/50 space-y-2 text-xs"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-slate-900">
                          {raw.brand} · MPN: <span className="font-mono">{raw.mpn}</span>
                        </span>
                        <button
                          type="button"
                          onClick={() => handleResearchSingleRow(raw)}
                          disabled={researchingRowKey === key}
                          className="text-xs text-slate-600 hover:text-slate-900 font-medium underline flex items-center gap-1 cursor-pointer"
                        >
                          <RefreshCw className={`w-3 h-3 ${researchingRowKey === key ? 'animate-spin' : ''}`} />
                          <span>Verify</span>
                        </button>
                      </div>

                      <div className="font-medium text-slate-800">
                        {spec?.officialNameWithAttributes || raw.rawProductName}
                      </div>

                      {spec?.researchNotes && (
                        <div className="text-[11px] text-slate-600 bg-white p-2 border border-slate-200 rounded">
                          {spec.researchNotes}
                        </div>
                      )}

                      <div className="text-[11px] text-slate-500 font-mono">
                        Category: {spec?.categoryPath || 'Diagnostic / Wound Care'}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Paste / Import Modal */}
      {pasteModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <h3 className="text-sm font-bold text-slate-900">
                Paste Raw Supplier Feed (CSV or TSV)
              </h3>
              <button
                type="button"
                onClick={() => setPasteModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 text-sm cursor-pointer"
              >
                ✕
              </button>
            </div>
            <p className="text-xs text-slate-600">
              Paste delimited data containing columns like MPN, Brand, Vendor Name, Purchase Price, Product Name, and UOM.
            </p>
            <textarea
              rows={8}
              value={pastedText}
              onChange={(e) => setPastedText(e.target.value)}
              placeholder="MPN,Brand,Vendor Name,Purchase Price,Product Name,UOM&#10;801,ProNet,Independence Medical,28.45,PRONET RET DRESS WHT SZ6 8IN 100/BG,BG&#10;301230700,Kendall,Independence Medical,645.00,KENDALL SCD 700 SERIES CONTROLLER SYS 1/EA,EA"
              className="w-full p-3 text-xs font-mono bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900"
            />
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setPasteModalOpen(false)}
                className="px-3.5 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleImportDelimitedFeed}
                className="px-4 py-1.5 text-xs font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800 cursor-pointer"
              >
                Parse & Transform to PIM
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
