import { db, sqlite } from './client.js';
import { products } from './schema.js';
import { runMigrations } from './migrate.js';
import type { Product } from '@b2b-agent/shared';

/**
 * Synthetic catalog for a fictional industrial-hardware & technical-textiles
 * bulk distributor. No real company, brand, or client data.
 *
 * 36 SKUs across 6 categories, with:
 *  - varied pricing tiers (paise-level fasteners up to four-figure safety gear)
 *  - 4 out-of-stock items (stockQty: 0) for the graceful-failure scenario
 *  - relatedProductIds forming realistic cross-sell bundles
 */
const catalog: Product[] = [
  // Fasteners
  { id: 'FAS-001', name: 'Hex Bolt M8x40 Zinc-Plated', category: 'Fasteners', spec: 'Grade 8.8, DIN 931, zinc-plated steel', unitPrice: 6, unitCost: 4.2, moq: 5000, stockQty: 200000, relatedProductIds: ['FAS-002', 'FAS-003'] },
  { id: 'FAS-002', name: 'Hex Nut M8 Zinc-Plated', category: 'Fasteners', spec: 'Grade 8, DIN 934, zinc-plated steel', unitPrice: 2, unitCost: 1.3, moq: 5000, stockQty: 250000, relatedProductIds: ['FAS-001', 'FAS-003'] },
  { id: 'FAS-003', name: 'Flat Washer M8', category: 'Fasteners', spec: 'DIN 125, zinc-plated steel', unitPrice: 0.8, unitCost: 0.5, moq: 10000, stockQty: 500000, relatedProductIds: ['FAS-001', 'FAS-002'] },
  { id: 'FAS-004', name: 'Self-Tapping Screw #8x1in', category: 'Fasteners', spec: 'Phillips pan head, zinc-plated steel', unitPrice: 1.5, unitCost: 1, moq: 10000, stockQty: 0, relatedProductIds: [] },
  { id: 'FAS-005', name: 'Carriage Bolt M10x60', category: 'Fasteners', spec: 'Grade 5, DIN 603, zinc-plated steel', unitPrice: 9, unitCost: 6, moq: 2000, stockQty: 80000, relatedProductIds: ['FAS-006'] },
  { id: 'FAS-006', name: 'Anchor Bolt M12x100 Wedge Type', category: 'Fasteners', spec: 'Carbon steel, hot-dip galvanized', unitPrice: 22, unitCost: 15, moq: 500, stockQty: 30000, relatedProductIds: ['FAS-005'] },

  // Bearings & Power Transmission
  { id: 'BRG-101', name: 'Deep Groove Ball Bearing 6205-2RS', category: 'Bearings & Power Transmission', spec: '25x52x15mm, rubber-sealed', unitPrice: 145, unitCost: 98, moq: 50, stockQty: 4000, relatedProductIds: ['BRG-103'] },
  { id: 'BRG-102', name: 'Tapered Roller Bearing 30205', category: 'Bearings & Power Transmission', spec: '25x52x16.25mm, single row', unitPrice: 320, unitCost: 215, moq: 20, stockQty: 1200, relatedProductIds: ['BRG-103'] },
  { id: 'BRG-103', name: 'Pillow Block Bearing UCP205', category: 'Bearings & Power Transmission', spec: '25mm bore, cast-iron housing', unitPrice: 480, unitCost: 325, moq: 10, stockQty: 900, relatedProductIds: ['BRG-101', 'BRG-102'] },
  { id: 'BRG-104', name: 'V-Belt A-Section 1200mm', category: 'Bearings & Power Transmission', spec: 'Wrapped construction, rubber/polyester', unitPrice: 180, unitCost: 122, moq: 50, stockQty: 3000, relatedProductIds: ['BRG-107'] },
  { id: 'BRG-105', name: 'Roller Chain 08B Simplex (5m coil)', category: 'Bearings & Power Transmission', spec: 'ISO 08B, carbon steel, self-lube', unitPrice: 950, unitCost: 645, moq: 10, stockQty: 500, relatedProductIds: ['BRG-107'] },
  { id: 'BRG-106', name: 'Timing Pulley 24T-5M', category: 'Bearings & Power Transmission', spec: '5M pitch, aluminium, 24 tooth', unitPrice: 260, unitCost: 178, moq: 20, stockQty: 0, relatedProductIds: [] },
  { id: 'BRG-107', name: 'Shaft Coupling Jaw Type L100', category: 'Bearings & Power Transmission', spec: 'Aluminium hub, urethane spider', unitPrice: 610, unitCost: 412, moq: 5, stockQty: 300, relatedProductIds: ['BRG-104', 'BRG-105'] },

  // Industrial Fabrics & Webbing
  { id: 'FAB-201', name: 'Polyester Webbing 50mm (roll, 100m)', category: 'Industrial Fabrics & Webbing', spec: '2200kg tensile, black', unitPrice: 2200, unitCost: 1500, moq: 5, stockQty: 400, relatedProductIds: ['FAB-206'] },
  { id: 'FAB-202', name: 'PVC Tarpaulin Fabric 610 GSM (per metre)', category: 'Industrial Fabrics & Webbing', spec: 'Waterproof, UV-stabilized, 2m width', unitPrice: 95, unitCost: 63, moq: 200, stockQty: 20000, relatedProductIds: ['FAB-206'] },
  { id: 'FAB-203', name: 'Cotton Canvas Duck Cloth 12oz (per metre)', category: 'Industrial Fabrics & Webbing', spec: 'Plain weave, natural, 1.5m width', unitPrice: 210, unitCost: 145, moq: 150, stockQty: 12000, relatedProductIds: [] },
  { id: 'FAB-204', name: 'Nylon Ripstop Fabric 70D (per metre)', category: 'Industrial Fabrics & Webbing', spec: 'PU-coated, 1.5m width', unitPrice: 165, unitCost: 110, moq: 200, stockQty: 15000, relatedProductIds: [] },
  { id: 'FAB-205', name: 'Geotextile Non-Woven Fabric 200gsm (per sqm)', category: 'Industrial Fabrics & Webbing', spec: 'Needle-punched polypropylene', unitPrice: 42, unitCost: 28, moq: 500, stockQty: 40000, relatedProductIds: [] },
  { id: 'FAB-206', name: 'Reflective Tape Fabric 3M-Grade (roll, 50m)', category: 'Industrial Fabrics & Webbing', spec: 'Silver, sew-on backing', unitPrice: 1400, unitCost: 985, moq: 10, stockQty: 600, relatedProductIds: ['FAB-201', 'FAB-202'] },
  { id: 'FAB-207', name: 'Industrial Felt Roll 5mm (per metre)', category: 'Industrial Fabrics & Webbing', spec: 'Wool-polyester blend, 1.5m width', unitPrice: 310, unitCost: 208, moq: 50, stockQty: 2500, relatedProductIds: [] },
  { id: 'FAB-208', name: 'Woven Polypropylene Sack Fabric (per metre)', category: 'Industrial Fabrics & Webbing', spec: 'Laminated, 1m width', unitPrice: 38, unitCost: 25, moq: 1000, stockQty: 0, relatedProductIds: [] },

  // Safety & PPE
  { id: 'PPE-301', name: 'Nitrile Safety Gloves (pair)', category: 'Safety & PPE', spec: 'Powder-free, textured grip', unitPrice: 28, unitCost: 19, moq: 500, stockQty: 40000, relatedProductIds: ['PPE-304'] },
  { id: 'PPE-302', name: 'Safety Helmet ABS Shell', category: 'Safety & PPE', spec: 'Vented, ratchet suspension', unitPrice: 145, unitCost: 97, moq: 100, stockQty: 6000, relatedProductIds: ['PPE-304'] },
  { id: 'PPE-303', name: 'Hi-Vis Safety Vest Mesh', category: 'Safety & PPE', spec: 'Class 2, reflective strips', unitPrice: 95, unitCost: 63, moq: 200, stockQty: 9000, relatedProductIds: ['PPE-302'] },
  { id: 'PPE-304', name: 'Safety Goggles Anti-Fog', category: 'Safety & PPE', spec: 'Polycarbonate lens, indirect vent', unitPrice: 65, unitCost: 43, moq: 200, stockQty: 8000, relatedProductIds: ['PPE-301', 'PPE-302'] },
  { id: 'PPE-305', name: 'Ear Plugs Foam (box of 100 pairs)', category: 'Safety & PPE', spec: 'NRR 32dB, disposable', unitPrice: 320, unitCost: 214, moq: 20, stockQty: 1500, relatedProductIds: [] },
  { id: 'PPE-306', name: 'Industrial Safety Harness Full-Body', category: 'Safety & PPE', spec: '5-point, dorsal D-ring, polyester webbing', unitPrice: 1450, unitCost: 985, moq: 10, stockQty: 400, relatedProductIds: ['FAB-201'] },
  { id: 'PPE-307', name: 'Steel-Toe Safety Boots (pair)', category: 'Safety & PPE', spec: 'Leather upper, oil-resistant sole', unitPrice: 780, unitCost: 525, moq: 50, stockQty: 2000, relatedProductIds: [] },

  // Adhesives & Sealants
  { id: 'ADH-401', name: 'Epoxy Structural Adhesive 400ml Cartridge', category: 'Adhesives & Sealants', spec: 'Two-part, high-strength, metal/concrete', unitPrice: 610, unitCost: 412, moq: 24, stockQty: 1200, relatedProductIds: ['ADH-402'] },
  { id: 'ADH-402', name: 'Silicone Sealant Industrial Grade 300ml', category: 'Adhesives & Sealants', spec: 'Neutral cure, weatherproof', unitPrice: 175, unitCost: 116, moq: 48, stockQty: 3000, relatedProductIds: ['ADH-401'] },
  { id: 'ADH-403', name: 'Cyanoacrylate Instant Adhesive 20g', category: 'Adhesives & Sealants', spec: 'Fast-set, low-viscosity', unitPrice: 45, unitCost: 29, moq: 100, stockQty: 5000, relatedProductIds: [] },
  { id: 'ADH-404', name: 'Polyurethane Foam Sealant 750ml', category: 'Adhesives & Sealants', spec: 'Gun-grade, expanding', unitPrice: 320, unitCost: 214, moq: 24, stockQty: 0, relatedProductIds: [] },

  // Packaging Materials
  { id: 'PKG-501', name: 'Stretch Wrap Film 500mm x 300m', category: 'Packaging Materials', spec: 'LLDPE, 20 micron', unitPrice: 420, unitCost: 282, moq: 30, stockQty: 2000, relatedProductIds: ['PKG-503'] },
  { id: 'PKG-502', name: 'Corrugated Carton Box 18x12x12in (bundle of 25)', category: 'Packaging Materials', spec: '5-ply, edge-crush tested', unitPrice: 1350, unitCost: 905, moq: 10, stockQty: 800, relatedProductIds: ['PKG-504'] },
  { id: 'PKG-503', name: 'Strapping Tape PP 12mm (roll, 1000m)', category: 'Packaging Materials', spec: 'Machine-grade polypropylene', unitPrice: 260, unitCost: 176, moq: 50, stockQty: 3000, relatedProductIds: ['PKG-501'] },
  { id: 'PKG-504', name: 'Bubble Wrap Roll 1m x 100m', category: 'Packaging Materials', spec: 'Anti-static, 10mm bubble', unitPrice: 780, unitCost: 522, moq: 15, stockQty: 1200, relatedProductIds: ['PKG-502'] },
];

function seed() {
  runMigrations();

  const productCount = sqlite.prepare('SELECT COUNT(*) as c FROM products').get() as { c: number };
  if (productCount.c > 0) {
    console.log(`Catalog already has ${productCount.c} products - clearing before reseed.`);
    sqlite.exec('DELETE FROM products; DELETE FROM orders; DELETE FROM audit_entries;');
  }

  for (const p of catalog) {
    db.insert(products).values(p).run();
  }

  console.log(`Seeded ${catalog.length} products.`);
  console.log(`Out of stock: ${catalog.filter((p) => p.stockQty === 0).map((p) => p.id).join(', ')}`);
}

seed();
