(function(root,factory){
'use strict';
const features=factory();
if(typeof module==='object'&&module.exports)module.exports=features;
if(root)root.EarthMapReferenceFeatures=features;
})(typeof window!=='undefined'?window:globalThis,function(){
'use strict';
const locations=[
 ['africa-kilimanjaro','Mount Kilimanjaro',-3.0674,37.3556,'Africa','volcanic peak'],
 ['africa-lake-victoria','Lake Victoria',-1.0,33.0,'Africa','lake'],
 ['africa-victoria-falls','Victoria Falls',-17.9243,25.8572,'Africa','waterfall'],
 ['africa-nyiragongo','Mount Nyiragongo',-1.52,29.25,'Africa','active volcano site'],
 ['africa-nile-delta','Nile Delta',30.9,31.4,'Africa','river delta'],
 ['africa-okavango-delta','Okavango Delta',-19.3,22.8,'Africa','inland delta / wetland'],
 ['africa-danakil','Danakil Depression',13.6,40.6,'Africa','geothermal depression'],
 ['africa-cape-good-hope','Cape of Good Hope',-34.3568,18.474,'Africa','coastal headland'],

 ['asia-everest','Mount Everest',27.9881,86.925,'Asia','mountain summit'],
 ['asia-dead-sea','Dead Sea',31.5,35.5,'Asia','hypersaline lake'],
 ['asia-lake-baikal','Lake Baikal',53.5587,108.165,'Asia','lake'],
 ['asia-mount-fuji','Mount Fuji',35.3606,138.7274,'Asia','volcanic peak'],
 ['asia-merapi','Mount Merapi',-7.54,110.446,'Asia','volcano site'],
 ['asia-ganges-delta','Ganges–Brahmaputra Delta',22.7,90.5,'Asia','river delta / wetland'],
 ['asia-damavand','Mount Damavand',35.95,52.109,'Asia','volcanic peak'],
 ['asia-gobi','Gobi Desert',42,107,'Asia','desert region'],

 ['europe-etna','Mount Etna',37.751,14.993,'Europe','active volcano site'],
 ['europe-mont-blanc','Mont Blanc',45.8326,6.8652,'Europe','mountain summit'],
 ['europe-eyjafjallajokull','Eyjafjallajökull',63.63,-19.62,'Europe','volcano site'],
 ['europe-vatnajokull','Vatnajökull',64.4,-16.8,'Europe','ice cap / glacier'],
 ['europe-lake-geneva','Lake Geneva',46.4,6.55,'Europe','lake'],
 ['europe-danube-delta','Danube Delta',45.17,29.75,'Europe','river delta / wetland'],
 ['europe-vesuvius','Mount Vesuvius',40.821,14.426,'Europe','volcano site'],
 ['europe-trolltunga','Trolltunga',60.124,6.74,'Europe','mountain escarpment'],

 ['north-america-grand-canyon','Grand Canyon',36.1069,-112.1129,'North America','canyon / river landscape'],
 ['north-america-yellowstone','Yellowstone Caldera',44.43,-110.67,'North America','volcanic caldera / geothermal area'],
 ['north-america-denali','Denali',63.0695,-151.0074,'North America','mountain summit'],
 ['north-america-st-helens','Mount St. Helens',46.1912,-122.1944,'North America','volcano site'],
 ['north-america-yosemite','Yosemite Valley',37.7459,-119.5936,'North America','glacial valley'],
 ['north-america-niagara','Niagara Falls',43.0962,-79.0377,'North America','waterfall'],
 ['north-america-great-lakes','Great Lakes',45,-84,'North America','freshwater lake system'],
 ['north-america-popocatepetl','Popocatépetl',19.0225,-98.627,'North America','active volcano site'],

 ['south-america-aconcagua','Aconcagua',-32.6532,-70.0109,'South America','mountain summit'],
 ['south-america-amazon-mouth','Amazon River mouth',-0.4,-49.0,'South America','river estuary'],
 ['south-america-angel-falls','Angel Falls',5.967,-62.535,'South America','waterfall'],
 ['south-america-atacama','Atacama Desert',-23.8634,-69.1328,'South America','hyperarid desert'],
 ['south-america-galapagos','Galápagos Islands',-0.9538,-90.9656,'South America','volcanic island ecosystem'],
 ['south-america-iguazu','Iguazú Falls',-25.6953,-54.4367,'South America','waterfall'],
 ['south-america-salar-uyuni','Salar de Uyuni',-20.1338,-67.4891,'South America','salt flat'],
 ['south-america-cotopaxi','Cotopaxi',-0.68,-78.437,'South America','volcano site'],

 ['oceania-great-barrier-reef','Great Barrier Reef',-18.3,147,'Oceania','coral reef system'],
 ['oceania-uluru','Uluru',-25.3444,131.0369,'Oceania','sandstone inselberg'],
 ['oceania-ruapehu','Mount Ruapehu',-39.28,175.57,'Oceania','active volcano site'],
 ['oceania-lake-taupo','Lake Taupō',-38.81,175.9,'Oceania','volcanic lake'],
 ['oceania-puncak-jaya','Puncak Jaya',-4.083,137.183,'Oceania','mountain summit'],
 ['oceania-blue-mountains','Blue Mountains',-33.7,150.3,'Oceania','mountain range'],
 ['oceania-milford-sound','Milford Sound / Piopiotahi',-44.6414,167.897,'Oceania','fjord'],
 ['oceania-aoraki','Aoraki / Mount Cook',-43.595,170.141,'Oceania','mountain summit'],

 ['antarctica-erebus','Mount Erebus',-77.53,167.17,'Antarctica','active volcano site'],
 ['antarctica-mcmurdo','McMurdo Station',-77.8419,166.6863,'Antarctica','research station'],
 ['antarctica-south-pole','Amundsen–Scott South Pole Station',-90,0,'Antarctica','research station / geographic pole'],
 ['antarctica-vostok','Vostok Station',-78.464,106.837,'Antarctica','research station'],
 ['antarctica-dry-valleys','McMurdo Dry Valleys',-77.5,162.5,'Antarctica','polar desert valley system'],
 ['antarctica-peninsula','Antarctic Peninsula',-65,-64,'Antarctica','peninsula / ice-sheet margin'],
 ['antarctica-dome-c','Dome C / Concordia Station',-75.1,123.35,'Antarctica','ice dome / research station'],
 ['antarctica-vinson','Vinson Massif',-78.5254,-85.6171,'Antarctica','mountain summit']
];
return locations.map(([key,label,latitude,longitude,continent,feature_type])=>({
 id:'feature-'+key,sector:'global_features',label,latitude,longitude,continent,feature_type,
 metric:'geographic reference',value:null,unit:'',observed_at:null,
 quality_status:'Curated reference location; not a live event or current alert.',
 source_name:'3D Earth global geographic reference catalogue',
 provider:'Named geographic feature coordinates; reference positions may represent a feature centre',
 location_kind:'stable geographic reference'
}));
});