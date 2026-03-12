const XLSX = require('./node_modules/xlsx/xlsx.js');
const fs = require('fs');
const path = require('path');

const dataDir = path.join(__dirname, 'public', 'data');

// ===== Stock Data (Storage Type 110/101) =====
const stockFile = path.join(dataDir, 'Zbindata_latest.xlsx');
const wb = XLSX.readFile(stockFile);
const ws = wb.Sheets[wb.SheetNames[0]];
const jsonData = XLSX.utils.sheet_to_json(ws);

console.log(`Total rows: ${jsonData.length}`);

// Material info map (description, bins)
const materialInfoMap = {};
jsonData.forEach(row => {
  const mat = String(row['Material'] || '');
  if (!mat) return;
  if (!materialInfoMap[mat]) materialInfoMap[mat] = { description: '', bins: [] };
  const desc = String(row['Material Description'] || '');
  if (desc) materialInfoMap[mat].description = desc;
  const bin = String(row['Storage Bin'] || '');
  if (bin && !materialInfoMap[mat].bins.includes(bin)) materialInfoMap[mat].bins.push(bin);
});

// Storage Type 110/101 filtering
const warehouseStockByMaterial = {};
jsonData.forEach(row => {
  const material = row['Material'];
  const storageType = String(row['Storage Type'] || '').trim();
  if (material && (storageType === '110' || storageType === '101')) {
    const matKey = String(material);
    if (!warehouseStockByMaterial[matKey]) warehouseStockByMaterial[matKey] = { stock: 0, unit: 'EA' };
    warehouseStockByMaterial[matKey].stock += parseFloat(row['Available stock']) || 0;
    warehouseStockByMaterial[matKey].unit = String(row['Base Unit of Measure'] || 'EA');
  }
});

const inventory = Object.entries(warehouseStockByMaterial)
  .map(([material, data]) => {
    const info = materialInfoMap[material] || { description: '', bins: [] };
    return {
      material,
      description: info.description,
      bin: info.bins[0] || '',
      allBins: info.bins,
      stock: data.stock,
      unit: data.unit
    };
  })
  .filter(item => item.description);

console.log(`Stock items (ST 110/101): ${inventory.length}`);

// Save stock_data.json
fs.writeFileSync(
  path.join(dataDir, 'stock_data.json'),
  JSON.stringify(inventory, null, 2),
  'utf-8'
);
console.log('stock_data.json saved');

// ===== Q Stock Data =====
const qStockData = [];
jsonData.forEach(row => {
  const storageType = String(row['Storage Type'] || '').trim();
  if (storageType === '100') {
    const material = String(row['Material'] || '');
    const stock = parseFloat(row['Available stock']) || 0;
    if (material && stock > 0) {
      qStockData.push({
        material,
        description: String(row['Material Description'] || ''),
        stock,
        unit: String(row['Base Unit of Measure'] || 'EA'),
        bin: String(row['Storage Bin'] || ''),
        grDate: String(row['GR Date'] || '')
      });
    }
  }
});

console.log(`Q Stock items (ST 100): ${qStockData.length}`);

fs.writeFileSync(
  path.join(dataDir, 'qstock_data.json'),
  JSON.stringify(qStockData, null, 2),
  'utf-8'
);
console.log('qstock_data.json saved');

// Quick check for 712580
const item712580 = inventory.find(i => i.material === '712580');
if (item712580) {
  console.log(`\n712580: stock=${item712580.stock} ${item712580.unit}`);
}
