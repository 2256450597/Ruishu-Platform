window.scenicData = {
  zhaojun: {
    name: "昭君故里", city: "湖北宜昌", visitors: "8,450", center: [31.231, 110.754], zoom: 15,
    files: ["昭君故里1"],
    routes: [
      {name: "昭君故里主游线", file: "昭君故里.geojson", type: "main", congestion: 85},
      {name: "昭君故里西南环线", file: "route6.gpx", type: "patrol", congestion: 46}
    ]
  },
  tanhualin: {
    name: "昙华林历史街区", city: "湖北武汉", visitors: "15,200", center: [30.550, 114.305], zoom: 16,
    files: ["昙华林1.gpx", "昙华林2.gpx", "昙华林3.gpx"],
    routes: [
      {name: "昙华林主游线", file: "昙华林2.gpx", type: "main", congestion: 85},
      {name: "昙华林慢行支线A", file: "昙华林1.gpx", type: "hiking", congestion: 52},
      {name: "昙华林慢行支线B", file: "昙华林3.gpx", type: "hiking", congestion: 47}
    ]
  },
  donghu: {
    name: "武汉东湖风景区", city: "湖北武汉", visitors: "42,150", center: [30.555, 114.365], zoom: 13,
    files: ["东湖1.gpx", "东湖2.gpx", "东湖3.gpx", "东湖4.gpx", "东湖5.gpx", "东湖6.gpx"],
    routes: [
      {name: "东湖主游线", file: "东湖2.gpx", type: "main", congestion: 85},
      {name: "东湖机动巡检线", file: "东湖2.gpx", type: "patrol"},
      {name: "东湖应急保障线", file: "东湖4.gpx", type: "emergency"},
      {name: "东湖慢行徒步线A", file: "东湖1.gpx", type: "hiking", congestion: 42},
      {name: "东湖慢行徒步线B", file: "东湖5.gpx", type: "hiking", congestion: 57},
      {name: "东湖备用接驳线", file: "东湖6.gpx", type: "hiking", congestion: 48},
      {name: "东湖环湖补充线", file: "东湖3.gpx", type: "hiking", congestion: 61}
    ]
  }
};
