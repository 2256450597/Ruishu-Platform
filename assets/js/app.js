const scenicData = window.scenicData;

const titles = {dashboard:"运营驾驶舱", fusion:"低空融合感知", route:"轨迹动线分析", conversion:"消费转化归因", merchant:"商家布局优化", guide:"个性化导览推荐", risk:"安全开发保障", report:"规划诊断报告"};
const mapIds = ["mapDashboard", "mapFusion", "mapRoute", "mapConversion", "mapMerchant", "mapGuide", "mapRisk"];
const pageToMapId = {
  dashboard: "mapDashboard",
  fusion: "mapFusion",
  route: "mapRoute",
  conversion: "mapConversion",
  merchant: "mapMerchant",
  guide: "mapGuide",
  risk: "mapRisk"
};

const maps = {}, layerGroups = {}, heatLayers = {}, gpxLayerGroups = {}, gpxLoadTokens = {};
const congestionLineGroups = {}, congestionHeatLayers = {};
const congestionGeoJsonLayers = {};
const congestionLoadTokens = {};
const commercePointLayers = {};
const commerceLoadTokens = {};
const droneAirspaceLayers = {};
const droneAirspaceLoadTokens = {};
const merchantPointLayers = {};
const merchantLoadTokens = {};
const safetyZoneLayers = {};
const safetyZoneLoadTokens = {};
const scenicFileDirs = {
  zhaojun: "昭君故里",
  tanhualin: "昙华林",
  donghu: "东湖"
};
let currentScenicKey = "zhaojun";

function getActivePageId(){
  const activeBtn = document.querySelector('.nav button.active');
  if (activeBtn && activeBtn.dataset && activeBtn.dataset.page) return activeBtn.dataset.page;
  const activePage = document.querySelector('.page.active');
  if (activePage && activePage.id) return activePage.id;
  return "dashboard";
}

function getPageModeByMapId(mapId){
  const pair = Object.entries(pageToMapId).find(([, value]) => value === mapId);
  return pair ? pair[0] : "dashboard";
}

function addHeat(mapId, heatPoints){
  if (heatLayers[mapId]) {
    maps[mapId].removeLayer(heatLayers[mapId]);
    delete heatLayers[mapId];
  }
  if (!Array.isArray(heatPoints) || !heatPoints.length) return;

  heatLayers[mapId] = L.heatLayer(heatPoints, {
    radius: 34,
    blur: 26,
    maxZoom: 16,
    minOpacity: 0.25,
    gradient: {
      0.15: '#7dd3fc',
      0.45: '#fde047',
      0.70: '#fb923c',
      1.00: '#ef4444'
    }
  }).addTo(maps[mapId]);
}

function ensureGpxLayerGroup(mapId){
  if (!gpxLayerGroups[mapId]) gpxLayerGroups[mapId] = L.layerGroup().addTo(maps[mapId]);
  return gpxLayerGroups[mapId];
}

function clearGpxLayers(mapId){
  delete gpxLoadTokens[mapId];
  if (gpxLayerGroups[mapId]) gpxLayerGroups[mapId].clearLayers();
}

function ensureCongestionLineGroup(mapId){
  if (!congestionLineGroups[mapId]) congestionLineGroups[mapId] = L.layerGroup().addTo(maps[mapId]);
  return congestionLineGroups[mapId];
}

function clearCongestionLayers(mapId){
  if (congestionLineGroups[mapId]) congestionLineGroups[mapId].clearLayers();
  if (congestionHeatLayers[mapId]) {
    maps[mapId].removeLayer(congestionHeatLayers[mapId]);
    delete congestionHeatLayers[mapId];
  }
}

function clearMapOverlays(mapId){
  if (layerGroups[mapId]) layerGroups[mapId].clearLayers();
  clearGpxLayers(mapId);
  clearCongestionLayers(mapId);
  clearCongestionHeatmap(mapId);
  clearCommercePoints(mapId);
  clearMerchantPoints(mapId);
  clearDroneAirspace(mapId);
  clearSafetyZones(mapId);
  if (heatLayers[mapId]) {
    maps[mapId].removeLayer(heatLayers[mapId]);
    delete heatLayers[mapId];
  }
}

function buildGpxCandidates(scenicKey, fileName){
  const dir = scenicFileDirs[scenicKey] || "";
  const rawPath = `./${dir}/${fileName}`;
  const encodedPath = encodeURI(rawPath);
  const spaceEncodedPath = rawPath.replace(/ /g, "%20");
  return Array.from(new Set([rawPath, encodedPath, spaceEncodedPath]));
}

async function fetchGpxText(scenicKey, fileName){
  const candidates = buildGpxCandidates(scenicKey, fileName);
  for (const url of candidates) {
    try {
      const res = await fetch(url, {cache: "no-store"});
      if (!res.ok) continue;
      const text = await res.text();
      if (text && text.includes("<gpx")) return {text, sourceUrl: url};
    } catch (err) {
      // try next url candidate
    }
  }
  throw new Error(`无法读取 GPX 文件: ${fileName}`);
}

async function fetchGeoJsonData(scenicKey, fileName){
  const candidates = buildGpxCandidates(scenicKey, fileName);
  for (const url of candidates) {
    try {
      const res = await fetch(url, {cache: "no-store"});
      if (!res.ok) continue;
      const data = await res.json();
      if (data && data.type === 'FeatureCollection') return {data, sourceUrl: url};
    } catch (err) {
      // try next url candidate
    }
  }
  throw new Error(`无法读取 GeoJSON 文件: ${fileName}`);
}

function colorByCongestion(congestion = 50){
  if (congestion > 80) return '#ef4444';
  if (congestion >= 50) return '#facc15';
  return '#22c55e';
}

function getRouteStyle(type, congestion){
  if (type === 'main') {
    return {
      color: colorByCongestion(congestion),
      weight: 9,
      opacity: 0.4
    };
  }
  if (type === 'emergency') {
    return {
      color: '#16a34a',
      weight: 4,
      opacity: 1,
      dashArray: '8, 8'
    };
  }
  if (type === 'drone' || type === 'patrol') {
    return {
      color: '#38bdf8',
      weight: 3,
      opacity: 1,
      dashArray: '5, 10'
    };
  }
  if (type === 'hiking') {
    return {
      color: '#7c3aed',
      weight: 5,
      opacity: 0.8
    };
  }
  return {
    color: '#64748b',
    weight: 4,
    opacity: 0.7
  };
}

function applyRouteLayerOrder(layer, type){
  if (!layer) return;
  if (type === 'drone' || type === 'patrol' || type === 'emergency') {
    layer.bringToFront();
  } else if (type === 'main') {
    layer.bringToBack();
  }
}

function buildOverlayTooltip(route, allRoutes){
  const mainCongestion = typeof route.congestion === 'number' ? route.congestion : 85;
  const overlapWithPatrol = allRoutes.some(r => r.file === route.file && (r.type === 'patrol' || r.type === 'drone'))
    && allRoutes.some(r => r.file === route.file && r.type === 'main');
  if (overlapWithPatrol && (route.type === 'main' || route.type === 'patrol' || route.type === 'drone')) {
    return `底层：主游线 (拥堵${mainCongestion}%) | 上层：蓝色机动巡检线`;
  }
  const typeLabel = {main: '主游线', patrol: '机动巡检线', drone: '机动巡检线', emergency: '应急通道', hiking: '徒步线'}[route.type] || '路线';
  return `${typeLabel} | 拥堵${typeof route.congestion === 'number' ? route.congestion : 50}%`;
}

function clearCongestionHeatmap(mapId){
  delete congestionLoadTokens[mapId];
  const heatKey = `${mapId}:congestion`;
  if (heatLayers[heatKey] && maps[mapId]) {
    maps[mapId].removeLayer(heatLayers[heatKey]);
    delete heatLayers[heatKey];
  }
  if (congestionGeoJsonLayers[mapId] && maps[mapId]) {
    maps[mapId].removeLayer(congestionGeoJsonLayers[mapId]);
    delete congestionGeoJsonLayers[mapId];
  }
}

function clearCommercePoints(mapId){
  delete commerceLoadTokens[mapId];
  if (commercePointLayers[mapId] && maps[mapId]) {
    maps[mapId].removeLayer(commercePointLayers[mapId]);
    delete commercePointLayers[mapId];
  }
}

function collectPointCoordsFromGeometry(geometry, collector){
  if (!geometry) return;
  if (geometry.type === 'Point' && Array.isArray(geometry.coordinates) && geometry.coordinates.length >= 2) {
    collector.push(geometry.coordinates);
    return;
  }
  if (geometry.type === 'MultiPoint' && Array.isArray(geometry.coordinates)) {
    geometry.coordinates.forEach(c => {
      if (Array.isArray(c) && c.length >= 2) collector.push(c);
    });
    return;
  }
  if (geometry.type === 'GeometryCollection' && Array.isArray(geometry.geometries)) {
    geometry.geometries.forEach(g => collectPointCoordsFromGeometry(g, collector));
  }
}

function loadCommercePoints(mapId, scenicKey){
  const map = maps[mapId];
  if (!map) return;
  clearCommercePoints(mapId);
  const loadToken = `${Date.now()}-${Math.random()}`;
  commerceLoadTokens[mapId] = loadToken;

  const scenicCommerceFiles = {
    donghu: '商业.geojson',
    tanhualin: '商业.geojson',
    zhaojun: '商业.geojson'
  };
  const commerceFile = scenicCommerceFiles[scenicKey];
  if (!commerceFile) return;

  fetchGeoJsonData(scenicKey, commerceFile).then(({data}) => {
    if (commerceLoadTokens[mapId] !== loadToken) return;
    const features = Array.isArray(data.features) ? data.features : [];
    const coords = [];
    features.forEach(feature => {
      collectPointCoordsFromGeometry(feature?.geometry, coords);
    });
    if (!coords.length) return;

    const group = L.featureGroup();
    coords.forEach(([lng, lat]) => {
      if (!Number.isFinite(lng) || !Number.isFinite(lat)) return;
      const marker = L.circleMarker([lat, lng], {
        radius: 6,
        color: '#16a34a',
        fillColor: '#16a34a',
        fillOpacity: 0.95,
        weight: 1.5
      }).bindPopup('<b>消费点</b><br>东湖消费活跃点')
        .bindTooltip('消费点', {direction: 'top', opacity: 0.9});
      marker.addTo(group);
    });
    group.addTo(map);
    if (group.bringToFront) group.bringToFront();
    commercePointLayers[mapId] = group;

    // 昭君故里消费点与主路线范围差异较大，合并视野避免“点存在但看不到”。
    if (scenicKey === 'zhaojun') {
      const pointBounds = group.getBounds();
      if (pointBounds && pointBounds.isValid()) {
        let merged = pointBounds;
        const routeGroup = gpxLayerGroups[mapId];
        if (routeGroup && routeGroup.eachLayer) {
          routeGroup.eachLayer(layer => {
            if (!layer || !layer.getBounds) return;
            const b = layer.getBounds();
            if (b && b.isValid()) merged = merged.extend(b);
          });
        }
        map.fitBounds(merged, {padding: [28, 28]});
      }
    }
  }).catch(err => {
    if (commerceLoadTokens[mapId] !== loadToken) return;
    console.error('[商业点位] 加载失败', err);
  });
}

function clearMerchantPoints(mapId){
  delete merchantLoadTokens[mapId];
  if (merchantPointLayers[mapId] && maps[mapId]) {
    maps[mapId].removeLayer(merchantPointLayers[mapId]);
    delete merchantPointLayers[mapId];
  }
}

function collectMerchantCoordsFromFeature(feature, collector){
  if (!feature) return;
  const geometry = feature.geometry;
  collectPointCoordsFromGeometry(geometry, collector);
  // 兼容昭君故里商家文件中 @circle.center 信息
  const center = feature?.properties?.['@circle']?.center;
  if (Array.isArray(center) && center.length >= 2) {
    const [lng, lat] = center;
    if (Number.isFinite(lng) && Number.isFinite(lat)) collector.push([lng, lat]);
  }
}

function loadMerchantPoints(mapId, scenicKey){
  const map = maps[mapId];
  if (!map) return;
  clearMerchantPoints(mapId);
  const loadToken = `${Date.now()}-${Math.random()}`;
  merchantLoadTokens[mapId] = loadToken;

  const scenicMerchantFiles = {
    donghu: '商家.geojson',
    tanhualin: '商家.geojson',
    zhaojun: '商家.geojson'
  };
  const merchantFile = scenicMerchantFiles[scenicKey];
  if (!merchantFile) return;

  fetchGeoJsonData(scenicKey, merchantFile).then(({data}) => {
    if (merchantLoadTokens[mapId] !== loadToken) return;
    const features = Array.isArray(data.features) ? data.features : [];
    const coords = [];
    features.forEach(feature => collectMerchantCoordsFromFeature(feature, coords));
    if (!coords.length) return;

    const group = L.featureGroup();
    coords.forEach(([lng, lat]) => {
      if (!Number.isFinite(lng) || !Number.isFinite(lat)) return;
      L.circleMarker([lat, lng], {
        radius: 6,
        color: '#dc2626',
        fillColor: '#ef4444',
        fillOpacity: 0.96,
        weight: 1.6,
        opacity: 0.95
      }).bindPopup('<b>商家点位</b><br>布局优化候选点')
        .bindTooltip('商家点位', {direction: 'top', opacity: 0.9})
        .addTo(group);
    });
    group.addTo(map);
    group.bringToFront();
    merchantPointLayers[mapId] = group;
    const bounds = group.getBounds();
    if (bounds && bounds.isValid()) map.fitBounds(bounds, {padding: [24, 24]});
  }).catch(err => {
    if (merchantLoadTokens[mapId] !== loadToken) return;
    console.error('[商家点位] 加载失败', err);
  });
}

function clearDroneAirspace(mapId){
  delete droneAirspaceLoadTokens[mapId];
  if (droneAirspaceLayers[mapId] && maps[mapId]) {
    maps[mapId].removeLayer(droneAirspaceLayers[mapId]);
    delete droneAirspaceLayers[mapId];
  }
}

function loadDroneAirspace(mapId, scenicKey){
  const map = maps[mapId];
  if (!map) return;
  clearDroneAirspace(mapId);
  const loadToken = `${Date.now()}-${Math.random()}`;
  droneAirspaceLoadTokens[mapId] = loadToken;

  const scenicAirspaceFiles = {
    donghu: '无人机区域.geojson',
    tanhualin: '无人机.geojson',
    zhaojun: '无人机区域_副本.geojson'
  };
  const fileName = scenicAirspaceFiles[scenicKey];
  if (!fileName) return;

  fetchGeoJsonData(scenicKey, fileName).then(({data}) => {
    if (droneAirspaceLoadTokens[mapId] !== loadToken) return;
    const features = Array.isArray(data.features) ? data.features : [];
    const renderFeatures = (scenicKey === 'zhaojun')
      ? features.filter(f => ['Polygon', 'MultiPolygon'].includes(f?.geometry?.type))
      : features;
    const renderData = {type: 'FeatureCollection', features: renderFeatures};

    const layer = L.geoJSON(renderData, {
      style: {
        color: '#64748b',
        weight: 2.2,
        opacity: 0.95,
        fillColor: '#94a3b8',
        fillOpacity: 0.5
      },
      pointToLayer: (_feature, latlng) => L.circleMarker(latlng, {
        radius: 5,
        color: '#64748b',
        weight: 1.6,
        fillColor: '#94a3b8',
        fillOpacity: 0.6,
        opacity: 0.9
      })
    }).addTo(map);
    layer.bindTooltip('无人机空域', {direction: 'top', sticky: true, opacity: 0.9});
    layer.bringToFront();
    droneAirspaceLayers[mapId] = layer;

    const bounds = layer.getBounds();
    if (bounds && bounds.isValid()) map.fitBounds(bounds, {padding: [24, 24]});
  }).catch(err => {
    if (droneAirspaceLoadTokens[mapId] !== loadToken) return;
    console.error('[无人机空域] 加载失败', err);
  });
}

function clearSafetyZones(mapId){
  delete safetyZoneLoadTokens[mapId];
  if (safetyZoneLayers[mapId] && maps[mapId]) {
    maps[mapId].removeLayer(safetyZoneLayers[mapId]);
    delete safetyZoneLayers[mapId];
  }
}

function loadSafetyZones(mapId, scenicKey){
  const map = maps[mapId];
  if (!map) return;
  clearSafetyZones(mapId);
  const loadToken = `${Date.now()}-${Math.random()}`;
  safetyZoneLoadTokens[mapId] = loadToken;

  const scenicSafetyFiles = {
    donghu: '安全.geojson',
    zhaojun: '安全.geojson'
  };
  const fileName = scenicSafetyFiles[scenicKey];
  if (!fileName) return;

  fetchGeoJsonData(scenicKey, fileName).then(({data}) => {
    if (safetyZoneLoadTokens[mapId] !== loadToken) return;
    const layer = L.geoJSON(data, {
      style: {
        color: '#dc2626',
        weight: 2.4,
        opacity: 0.9,
        fillColor: '#ef4444',
        fillOpacity: 0.24
      },
      pointToLayer: (_feature, latlng) => L.circleMarker(latlng, {
        radius: 5,
        color: '#dc2626',
        weight: 1.6,
        fillColor: '#ef4444',
        fillOpacity: 0.45,
        opacity: 0.9
      })
    }).addTo(map);
    layer.bindTooltip('安全开发范围', {direction: 'top', sticky: true, opacity: 0.9});
    layer.bringToFront();
    safetyZoneLayers[mapId] = layer;
    const bounds = layer.getBounds();
    if (bounds && bounds.isValid()) map.fitBounds(bounds, {padding: [24, 24]});
  }).catch(err => {
    if (safetyZoneLoadTokens[mapId] !== loadToken) return;
    console.error('[安全范围] 加载失败', err);
  });
}

function clamp(value, min, max){
  return Math.max(min, Math.min(max, value));
}

function generateHeatPointsFromLine(coordinates, intensity = 1.0, density = 28, spread = 0.00012){
  if (!Array.isArray(coordinates) || coordinates.length < 2) return [];
  const heatPoints = [];

  for (let i = 0; i < coordinates.length - 1; i += 1) {
    const current = coordinates[i];
    const next = coordinates[i + 1];
    if (!Array.isArray(current) || !Array.isArray(next) || current.length < 2 || next.length < 2) continue;
    const [lng1, lat1] = current;
    const [lng2, lat2] = next;

    const segLen = Math.hypot(lng2 - lng1, lat2 - lat1);
    const dynamicDensity = Math.max(18, Math.min(55, Math.round(segLen * 52000)));
    const count = Number.isFinite(density) ? Math.max(density, dynamicDensity) : dynamicDensity;
    const phase = Math.random() * Math.PI * 2;
    const hotspotCenter = 0.2 + Math.random() * 0.6;
    const hotspotWidth = 0.10 + Math.random() * 0.14;
    const sparseKeepRatio = 0.62;

    for (let j = 0; j <= count; j += 1) {
      if (Math.random() > sparseKeepRatio) continue;
      const ratio = count === 0 ? 0 : j / count;
      const interpLng = lng1 + (lng2 - lng1) * ratio;
      const interpLat = lat1 + (lat2 - lat1) * ratio;
      const jitterLat = interpLat + (Math.random() - 0.5) * spread;
      const jitterLng = interpLng + (Math.random() - 0.5) * spread;

      const wave = (Math.sin(ratio * Math.PI * 2 + phase) + 1) / 2; // 0~1
      const noise = Math.random() * 0.12;
      const hotspot = Math.exp(-Math.pow((ratio - hotspotCenter) / hotspotWidth, 2));
      const localIntensity = clamp((0.10 + wave * 0.16 + noise + hotspot * 0.42) * intensity, 0.08, 0.72);

      heatPoints.push([jitterLat, jitterLng, localIntensity]);
    }
  }
  return heatPoints;
}

function collectHeatPointsFromGeometry(geometry, collector){
  if (!geometry) return;
  if (geometry.type === 'LineString') {
    collector.push(...generateHeatPointsFromLine(geometry.coordinates, 1.0, 28, 0.00012));
    return;
  }
  if (geometry.type === 'MultiLineString') {
    geometry.coordinates.forEach(line => {
      collector.push(...generateHeatPointsFromLine(line, 1.0, 28, 0.00012));
    });
    return;
  }
  if (geometry.type === 'GeometryCollection' && Array.isArray(geometry.geometries)) {
    geometry.geometries.forEach(g => collectHeatPointsFromGeometry(g, collector));
  }
}

function averageLatOfFeature(feature){
  const coords = feature?.geometry?.coordinates;
  if (!Array.isArray(coords) || !coords.length) return Number.POSITIVE_INFINITY;
  const lats = coords.map(c => c[1]).filter(v => Number.isFinite(v));
  if (!lats.length) return Number.POSITIVE_INFINITY;
  return lats.reduce((a, b) => a + b, 0) / lats.length;
}

function loadCongestionHeatmap(mapId, scenicKey){
  const map = maps[mapId];
  if (!map) return;
  clearCongestionHeatmap(mapId);
  const loadToken = `${Date.now()}-${Math.random()}`;
  congestionLoadTokens[mapId] = loadToken;

  const scenicCongestionFiles = {
    donghu: ['./东湖/拥堵1.geojson', './东湖/拥堵2.geojson'],
    tanhualin: ['./昙华林/拥堵3.geojson'],
    zhaojun: ['./昭君故里/拥堵.geojson']
  };
  const files = scenicCongestionFiles[scenicKey];
  if (!files || !files.length) return;

  Promise.all(files.map(url => fetch(url, {cache: 'no-store'}).then(res => {
    if (!res.ok) throw new Error(`GeoJSON加载失败: ${url}`);
    return res.json();
  }))).then(collections => {
    if (congestionLoadTokens[mapId] !== loadToken) return;
    const allFeatures = collections.flatMap(fc => Array.isArray(fc.features) ? fc.features : []);
    const heatPoints = [];
    allFeatures.forEach(feature => {
      if (!feature || !feature.geometry) return;
      collectHeatPointsFromGeometry(feature.geometry, heatPoints);
    });

    let lineLayer = null;
    if (allFeatures.length) {
      lineLayer = L.geoJSON({type: 'FeatureCollection', features: allFeatures}, {
        style: {color: '#ef4444', weight: 8, opacity: 0.5}
      }).addTo(map);
      congestionGeoJsonLayers[mapId] = lineLayer;
    }

    if (heatPoints.length) {
      const heatKey = `${mapId}:congestion`;
      heatLayers[heatKey] = L.heatLayer(heatPoints, {
        radius: 10,
        blur: 8,
        maxZoom: 16,
        max: 1.35,
        gradient: {
          0.30: 'blue',
          0.52: 'lime',
          0.75: 'yellow',
          0.9: 'orange',
          1.0: 'red'
        }
      }).addTo(map);
      heatLayers[heatKey].bringToFront();
    }
    if (lineLayer) lineLayer.bringToFront();
    const bounds = lineLayer?.getBounds?.();
    if (bounds && bounds.isValid()) map.fitBounds(bounds, {padding: [24, 24]});
  }).catch(err => {
    if (congestionLoadTokens[mapId] !== loadToken) return;
    console.error('[GeoJSON拥堵热力] 加载失败', err);
  });
}

function congestionColor(score){
  if (score >= 0.80) return '#dc2626';
  if (score >= 0.65) return '#f97316';
  if (score >= 0.45) return '#facc15';
  return '#22c55e';
}

function flattenLatLngs(input){
  if (!Array.isArray(input)) return [];
  if (input.length && input[0] && typeof input[0].lat === 'number' && typeof input[0].lng === 'number') return input;
  return input.flatMap(flattenLatLngs);
}

function collectTrackLatLngsFromLayer(layer){
  if (!layer) return [];
  let points = [];
  if (layer.getLatLngs) {
    points = points.concat(flattenLatLngs(layer.getLatLngs()));
  }
  if (layer.getLayers) {
    points = points.concat(layer.getLayers().flatMap(collectTrackLatLngsFromLayer));
  }
  return points;
}

function getTrackLatLngs(gpxLayer){
  if (!gpxLayer) return [];
  return collectTrackLatLngsFromLayer(gpxLayer);
}

function buildCongestionScore(scenicKey, routeIndex, pointIndex, total){
  const ratio = total > 1 ? pointIndex / (total - 1) : 0;
  const scenicBias = (scenicKey.length % 5) * 0.03;
  const wave = (Math.sin((ratio * 6.28) + routeIndex) + 1) / 2;
  const hotspot = Math.exp(-Math.pow((ratio - 0.25) / 0.12, 2)) * 0.30 + Math.exp(-Math.pow((ratio - 0.72) / 0.14, 2)) * 0.25;
  return Math.max(0.2, Math.min(0.82, 0.23 + scenicBias + wave * 0.30 + hotspot * 0.75));
}

function drawCongestionForRoute(mapId, scenicKey, routeIndex, routeName, latlngs, heatCollector){
  if (!latlngs || latlngs.length < 2) return;
  const group = ensureCongestionLineGroup(mapId);

  for (let i = 0; i < latlngs.length - 1; i += 1) {
    const score = buildCongestionScore(scenicKey, routeIndex, i, latlngs.length);
    const level = score >= 0.8 ? '重度拥堵' : score >= 0.65 ? '中度拥堵' : score >= 0.45 ? '轻度拥堵' : '通畅';
    L.polyline([latlngs[i], latlngs[i + 1]], {
      color: congestionColor(score),
      weight: 7,
      opacity: 0.9
    }).bindPopup(`<b>${routeName}</b><br>路段状态：${level}<br>拥堵指数：${Math.round(score * 100)}%`).addTo(group);

    if (score >= 0.72 && i % 2 === 0) heatCollector.push([latlngs[i].lat, latlngs[i].lng, score]);
  }
}

function addCongestionHeat(mapId, heatPoints){
  if (congestionHeatLayers[mapId]) {
    maps[mapId].removeLayer(congestionHeatLayers[mapId]);
    delete congestionHeatLayers[mapId];
  }
  if (!heatPoints.length) return;

  congestionHeatLayers[mapId] = L.heatLayer(heatPoints, {
    radius: 16,
    blur: 14,
    maxZoom: 17,
    minOpacity: 0.2,
    gradient: {
      0.35: '#22c55e',
      0.55: '#facc15',
      0.75: '#f97316',
      1.0: '#dc2626'
    }
  }).addTo(maps[mapId]);
}

function loadGpxRoutes(mapId, scenicKey, data, options = {}){
  const map = maps[mapId];
  if (!map) return;
  const {allowedTypes = null, randomOne = false, guideMode = false} = options;
  const guideStyle = {color: '#facc15', weight: 6, opacity: 0.95};

  let routeDefs = Array.isArray(data.routes) && data.routes.length
    ? data.routes.map((r, idx) => ({
      name: r.name || `路线${idx + 1}`,
      file: r.file,
      type: r.type || 'hiking',
      congestion: typeof r.congestion === 'number' ? r.congestion : 50
    }))
    : (Array.isArray(data.files) ? data.files : []).map((fileName, idx) => ({
      name: fileName,
      file: fileName,
      type: idx === 0 ? 'main' : 'hiking',
      congestion: idx === 0 ? 72 : 45
    }));

  if (Array.isArray(allowedTypes) && allowedTypes.length) {
    routeDefs = routeDefs.filter(route => allowedTypes.includes(route.type));
  }
  if (guideMode) {
    // 固定导览路线：优先主游线，其次徒步线，再到其它类型。
    const priority = {main: 1, hiking: 2, patrol: 3, emergency: 4, drone: 5};
    routeDefs = routeDefs
      .slice()
      .sort((a, b) => (priority[a.type] || 99) - (priority[b.type] || 99) || a.name.localeCompare(b.name));
    routeDefs = routeDefs.length ? [routeDefs[0]] : [];
  } else if (randomOne && routeDefs.length > 1) {
    const pick = routeDefs[Math.floor(Math.random() * routeDefs.length)];
    routeDefs = [pick];
  }

  if (!routeDefs.length) {
    map.setView(data.center, data.zoom);
    return;
  }

  const loadToken = `${Date.now()}-${Math.random()}`;
  gpxLoadTokens[mapId] = loadToken;
  const group = ensureGpxLayerGroup(mapId);
  const transparent1px = "data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=";

  let remaining = routeDefs.length;
  let mergedBounds = null;

  const finalize = () => {
    remaining -= 1;
    if (remaining > 0) return;
    if (gpxLoadTokens[mapId] !== loadToken) return;
    if (mergedBounds && mergedBounds.isValid()) map.fitBounds(mergedBounds, {padding: [24, 24]});
    else map.setView(data.center, data.zoom);
  };

  routeDefs.forEach((routeDef) => {
    const style = guideMode ? guideStyle : getRouteStyle(routeDef.type, routeDef.congestion);
    const fileName = routeDef.file;

    if (fileName.toLowerCase().endsWith('.geojson')) {
      fetchGeoJsonData(scenicKey, fileName).then(({data: geojson, sourceUrl}) => {
        if (gpxLoadTokens[mapId] !== loadToken) return;
        const features = Array.isArray(geojson.features) ? geojson.features : [];
        const shouldSplitZhaojun = !guideMode && scenicKey === 'zhaojun' && fileName === '昭君故里.geojson' && routeDef.type === 'main' && features.length > 1;

        if (shouldSplitZhaojun) {
          // 昭君故里：沿河（纬度更低）的路段保留主路，其余改为紫色支路
          let mainIndex = 0;
          let minAvgLat = Number.POSITIVE_INFINITY;
          features.forEach((feature, idx) => {
            const avgLat = averageLatOfFeature(feature);
            if (avgLat < minAvgLat) {
              minAvgLat = avgLat;
              mainIndex = idx;
            }
          });

          const mainFeature = features[mainIndex];
          const branchFeatures = features.filter((_, idx) => idx !== mainIndex);

          const mainLayer = L.geoJSON({type: 'FeatureCollection', features: [mainFeature]}, {
            style: getRouteStyle('main', routeDef.congestion)
          }).addTo(group);
          mainLayer.bindPopup(`<b>${routeDef.name || fileName}</b><br>类型：main（沿河主路）<br>数据源：GeoJSON`);
          mainLayer.bindTooltip('主游线（沿河）', {direction: 'top', sticky: true, opacity: 0.95});
          applyRouteLayerOrder(mainLayer, 'main');

          const branchLayer = L.geoJSON({type: 'FeatureCollection', features: branchFeatures}, {
            style: getRouteStyle('hiking', 50)
          }).addTo(group);
          branchLayer.bindPopup('<b>昭君故里支线</b><br>类型：hiking（支路）');
          branchLayer.bindTooltip('支路（北侧及其它分支）', {direction: 'top', sticky: true, opacity: 0.95});
          applyRouteLayerOrder(branchLayer, 'hiking');

          const b1 = mainLayer.getBounds();
          if (b1 && b1.isValid()) mergedBounds = mergedBounds ? mergedBounds.extend(b1) : b1;
          const b2 = branchLayer.getBounds();
          if (b2 && b2.isValid()) mergedBounds = mergedBounds ? mergedBounds.extend(b2) : b2;
        } else {
          let renderGeoJson = geojson;
          if (guideMode) {
            const srcFeatures = Array.isArray(geojson.features) ? geojson.features : [];
            const firstLine = srcFeatures.find(f => f?.geometry?.type === 'LineString' && Array.isArray(f.geometry.coordinates));
            if (firstLine) {
              const coords = firstLine.geometry.coordinates;
              const keep = Math.max(2, Math.floor(coords.length * 0.45));
              renderGeoJson = {
                type: 'FeatureCollection',
                features: [{
                  type: 'Feature',
                  properties: firstLine.properties || {},
                  geometry: {type: 'LineString', coordinates: coords.slice(0, keep)}
                }]
              };
            }
          }
          const geoLayer = L.geoJSON(renderGeoJson, {style}).addTo(group);
          const bounds = geoLayer.getBounds();
          if (bounds && bounds.isValid()) mergedBounds = mergedBounds ? mergedBounds.extend(bounds) : bounds;
          geoLayer.bindPopup(`<b>${routeDef.name || fileName}</b><br>类型：${guideMode ? '导览推荐线（固定）' : routeDef.type}<br>数据源：GeoJSON`);
          geoLayer.bindTooltip(buildOverlayTooltip(routeDef, routeDefs), {direction: 'top', sticky: true, opacity: 0.95});
          if (!guideMode) applyRouteLayerOrder(geoLayer, routeDef.type);
        }
        console.info(`[GeoJSON] 路线加载成功: ${sourceUrl}`);
        finalize();
      }).catch((err) => {
        if (gpxLoadTokens[mapId] !== loadToken) return;
        console.error(`[GeoJSON] 路线读取失败: ${fileName}`, err);
        finalize();
      });
      return;
    }

    fetchGpxText(scenicKey, fileName).then(({text, sourceUrl}) => {
      if (gpxLoadTokens[mapId] !== loadToken) return;

      const gpxLayer = new L.GPX(text, {
        async: true,
        marker_options: {
          startIconUrl: transparent1px,
          endIconUrl: transparent1px,
          shadowUrl: transparent1px,
          iconSize: [1, 1],
          shadowSize: [1, 1],
          iconAnchor: [0, 0],
          shadowAnchor: [0, 0]
        },
        polyline_options: style,
        gpx_options: {parseElements: ['track', 'route']}
      });

      gpxLayer.on('loaded', (e) => {
        if (gpxLoadTokens[mapId] !== loadToken) return;
        const routeName = (e.target.get_name && e.target.get_name()) || fileName;
        const distanceMeters = (e.target.get_distance && e.target.get_distance()) || 0;
        const distanceKm = (distanceMeters / 1000).toFixed(2);

        if (guideMode) {
          const latlngs = getTrackLatLngs(e.target);
          const keep = Math.max(2, Math.floor(latlngs.length * 0.45));
          const partial = latlngs.slice(0, keep);
          if (partial.length >= 2) {
            group.removeLayer(e.target);
            const guideLayer = L.polyline(partial, guideStyle).addTo(group);
            const b = guideLayer.getBounds();
            if (b && b.isValid()) mergedBounds = mergedBounds ? mergedBounds.extend(b) : b;
            guideLayer.bindPopup(`<b>${routeDef.name || routeName}</b><br>类型：导览推荐线（固定）<br>展示：前段45%`);
          } else {
            const b = e.target.getBounds();
            if (b && b.isValid()) mergedBounds = mergedBounds ? mergedBounds.extend(b) : b;
          }
        } else {
          const bounds = e.target.getBounds();
          if (bounds && bounds.isValid()) mergedBounds = mergedBounds ? mergedBounds.extend(bounds) : bounds;
          e.target.bindPopup(`<b>${routeDef.name || routeName}</b><br>类型：${routeDef.type}<br>总长度：${distanceKm} km`);
          e.target.bindTooltip(buildOverlayTooltip(routeDef, routeDefs), {direction: 'top', sticky: true, opacity: 0.95});
          applyRouteLayerOrder(e.target, routeDef.type);
        }
        console.info(`[GPX] 轨迹加载成功: ${sourceUrl}，长度 ${distanceKm} km`);
        finalize();
      });

      gpxLayer.on('error', (err) => {
        if (gpxLoadTokens[mapId] !== loadToken) return;
        console.error(`[GPX] 轨迹解析失败: ${fileName}`, err);
        finalize();
      });

      gpxLayer.addTo(group);
    }).catch((err) => {
      if (gpxLoadTokens[mapId] !== loadToken) return;
      console.error(`[GPX] 轨迹读取失败: ${fileName}`, err);
      finalize();
    });
  });
}

function addContent(mapId, scenicKey, data, pageMode){
  clearMapOverlays(mapId);
  if (pageMode === 'fusion') {
    loadGpxRoutes(mapId, scenicKey, data);
    loadCongestionHeatmap(mapId, scenicKey);
    loadCommercePoints(mapId, scenicKey);
    return;
  }
  if (pageMode === 'dashboard') {
    loadDroneAirspace(mapId, scenicKey);
    return;
  }
  if (pageMode === 'route') {
    loadCongestionHeatmap(mapId, scenicKey);
    return;
  }
  if (pageMode === 'conversion') {
    loadCommercePoints(mapId, scenicKey);
    return;
  }
  if (pageMode === 'guide') {
    loadGpxRoutes(mapId, scenicKey, data, {guideMode: true});
    return;
  }
  if (pageMode === 'merchant' || pageMode === 'risk') {
    if (pageMode === 'merchant') {
      loadMerchantPoints(mapId, scenicKey);
    }
    if (pageMode === 'risk') {
      loadSafetyZones(mapId, scenicKey);
    }
    return;
  }
  loadGpxRoutes(mapId, scenicKey, data);
}

function isMapContainerVisible(mapId){
  const el = document.getElementById(mapId);
  if (!el) return false;
  return el.offsetParent !== null;
}

function ensureMap(mapId){
  if (maps[mapId]) return maps[mapId];

  const el = document.getElementById(mapId);
  if (!el) return null;

  const map = L.map(mapId, {zoomControl: true, attributionControl: true});
  L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
    maxZoom: 19,
    subdomains: 'abcd',
    attribution: '&copy; OpenStreetMap &copy; CARTO'
  }).addTo(map);
  maps[mapId] = map;
  layerGroups[mapId] = L.layerGroup().addTo(map);
  return map;
}

function renderMap(mapId, key, {invalidate} = {invalidate: false}){
  const data = scenicData[key];
  if (!data) return;
  const map = ensureMap(mapId);
  if (!map) return;

  map.setView(data.center, data.zoom);
  addContent(mapId, key, data, getPageModeByMapId(mapId));

  if (invalidate) {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        map.invalidateSize();
      });
    });
  }
}

function updateScenicHeader(key){
  const data = scenicData[key];
  if (!data) return;
  document.querySelectorAll('.scenicName').forEach(el => el.innerText = data.name);
  const visitorsEl = document.getElementById('visitors');
  if (visitorsEl) visitorsEl.innerText = data.visitors;
}

document.querySelectorAll('.nav button').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.nav button').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    const id = btn.dataset.page;
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.getElementById(id).classList.add('active');
    document.getElementById('pageTitle').innerText = titles[id];
    document.getElementById('pageCrumb').innerText = titles[id];
    const mapId = pageToMapId[id];
    if (mapId) renderMap(mapId, currentScenicKey, {invalidate: true});
    window.scrollTo({top: 0, behavior: 'smooth'});
  });
});

document.getElementById('scenicSelect').addEventListener('change', function(){
  currentScenicKey = this.value;
  updateScenicHeader(currentScenicKey);
  Object.keys(maps).forEach(mapId => {
    renderMap(mapId, currentScenicKey, {invalidate: isMapContainerVisible(mapId)});
  });
});

function initApp(){
  const select = document.getElementById('scenicSelect');
  if (select) select.value = "zhaojun";
  currentScenicKey = "zhaojun";
  updateScenicHeader(currentScenicKey);

  const pageId = getActivePageId();
  const mapId = pageToMapId[pageId];
  if (mapId) renderMap(mapId, currentScenicKey, {invalidate: true});
}

window.addEventListener('load', initApp);
