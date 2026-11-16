import { quoteContentSchema } from "../src/lib/quote-domain";

type PackageSource = {
  key: string;
  name: string;
  destination: string;
  duration: string;
  days: [city: string, title: string, activities: string][];
  hotels: [city: string, property: string, room: string, meals: string, notes: string, option?: number][];
  routes: [from: string, to: string, detail: string, mode?: "Car" | "Ferry / boat"][];
  options: [name: string, price: number, meals: string][];
  includes: string[];
  excludes: string[];
  terms: string;
  extras?: [name: string, price: number, basis: "Total" | "Per person", description: string][];
};

const sources: PackageSource[] = [
  {
    key: "andaman", name: "Andaman honeymoon", destination: "Andaman", duration: "5 days / 4 nights",
    days: [
      ["Port Blair", "Arrival and light show", "Airport pickup, Corbyn’s Cove and Cellular Jail light and sound show. Check Monday closure."],
      ["Port Blair", "Ross Island and North Bay", "Boat excursion and optional water sports. Return to Port Blair."],
      ["Havelock", "Ferry and Radhanagar Beach", "Ferry to Havelock, hotel check-in and Radhanagar beach at sunset."],
      ["Port Blair", "Kalapathar Beach and return ferry", "Beach visit, ferry back to Port Blair and shopping if time allows."],
      ["Port Blair", "Departure", "Breakfast and airport transfer."],
    ],
    hotels: [
      ["Port Blair", "Hotel Sweneha / TGS Dino or similar", "Double room", "Breakfast and dinner", "Nights 1, 2 and 4"],
      ["Havelock", "Radhakrishna Resort or similar", "Double room", "Breakfast and dinner", "Night 3"],
    ],
    routes: [["Port Blair Airport", "Port Blair", "Private AC transfers and itinerary sightseeing"], ["Port Blair", "Havelock", "Private ferry tickets", "Ferry / boat"], ["Havelock", "Port Blair", "Private ferry tickets", "Ferry / boat"], ["Port Blair hotel", "Port Blair Airport", "Departure car"]],
    options: [["Andaman couple package", 42000, "Breakfast and dinner (MAP)"]],
    includes: ["Accommodation and breakfast/dinner", "Listed entry tickets and sightseeing", "Return private ferry and AC vehicle transfers"],
    excludes: ["Airfare, water sports and lunch", "Personal expenses and extra excursions", "Weather, ferry or flight disruption charges", "GST shown separately in the source"],
    terms: "Confirm current cancellation and disruption terms with suppliers before issuing a quote.",
  },
  {
    key: "kerala", name: "Kerala honeymoon", destination: "Munnar and Alleppey", duration: "4 days / 3 nights",
    days: [
      ["Munnar", "Kochi to Munnar", "Adimali, Cheeyappara and Valara waterfalls, viewpoints and tea museum."],
      ["Munnar", "Munnar sightseeing", "Eravikulam National Park, Photo Point, Mattupetty and Kundala dams, tea factory."],
      ["Alleppey", "Houseboat cruise", "Travel to Alleppey and board the premium houseboat around noon. See the backwaters and Kuttanadu."],
      ["Kochi", "Departure through Kochi", "Return by road with sightseeing along the way."],
    ],
    hotels: [["Munnar", "Vega Munnar", "Vega Delight", "Per selected option", "Nights 1–2"], ["Alleppey", "Premium houseboat", "Premium room", "All meals", "Night 3"]],
    routes: [["Kochi", "Munnar", "AC sedan and en-route sightseeing"], ["Munnar", "Munnar", "Local sightseeing by sedan"], ["Munnar", "Alleppey", "Sedan and houseboat boarding"], ["Alleppey", "Kochi", "Sightseeing and departure"]],
    options: [["Breakfast plan (CP)", 49340, "Breakfast in Munnar, all meals on houseboat"], ["Breakfast and dinner (MAP)", 52750, "Breakfast and dinner in Munnar, all meals on houseboat"]],
    includes: ["Private AC vehicle and driver-guide", "Listed sightseeing, tolls, parking and fuel", "Accommodation and meals per option"],
    excludes: ["Entry fees and adventure activities", "Unlisted meals and personal expenses", "Air, train and bus fares", "Disruption costs"],
    terms: "Source lists tiered cancellation charges. Confirm current tiers and charges for the exact dates before approval; unused services are subject to the supplier’s terms.",
  },
  {
    key: "kashmir", name: "Kashmir honeymoon", destination: "Kashmir", duration: "6 days / 5 nights",
    days: [
      ["Srinagar", "Arrival and Shikara ride", "Srinagar Airport pickup, hotel and a one-hour Shikara ride."],
      ["Gulmarg", "Gulmarg day trip", "Gondola phases 1 and 2, with optional local attractions and winter activities."],
      ["Pahalgam", "Pahalgam day trip", "Pampore saffron fields, apple orchards and optional Aru, Betaab and Chandanwari excursions."],
      ["Sonmarg", "Sonmarg day trip", "Sightseeing around Sonmarg. Confirm glacier access and what is included."],
      ["Srinagar", "Mughal gardens", "Nishat, Shalimar, Chashma Shahi and other local sights."],
      ["Srinagar", "Departure", "Hotel checkout and airport transfer."],
    ],
    hotels: [
      ["Kashmir", "Hotel Downtown / Ennco Resorts / Palm Spring", "Double deluxe", "Breakfast and dinner", "Confirm hotel and base city; itinerary and hotel line differ in source.", 0],
      ["Kashmir", "Namrose Resorts", "Double deluxe", "Breakfast and dinner", "Confirm hotel and base city before approval.", 1],
    ],
    routes: [["Srinagar Airport", "Kashmir hotel", "Private non-AC Etios/Amaze or similar"], ["Srinagar", "Gulmarg", "Round-trip sightseeing"], ["Srinagar", "Pahalgam", "Round trip; some local union cabs extra"], ["Srinagar", "Sonmarg", "Round trip, weather permitting"], ["Kashmir hotel", "Srinagar Airport", "Departure"]],
    options: [["Comfort hotels", 50500, "Breakfast and dinner (MAP)"], ["Namrose Resorts", 62500, "Breakfast and dinner (MAP)"]],
    includes: ["5 nights and listed meals", "Private non-AC transfers and sightseeing", "Listed Gondola and Shikara services", "Tolls, parking, fuel and driver allowance"],
    excludes: ["Airfare and train fare", "Unlisted meals and personal expenses", "Union cabs, most entry tickets and optional excursions", "Winter chain vehicles, insurance and disruption costs"],
    terms: "The source conflicts on the base city and pony/Thajiwas inclusions. Confirm both, availability and supplier cancellation terms before approval.",
  },
  {
    key: "sikkim", name: "Gangtok and Darjeeling honeymoon", destination: "Gangtok and Darjeeling", duration: "5 days / 4 nights",
    days: [
      ["Gangtok", "Bagdogra pickup", "Daytime transfer from Bagdogra Airport and hotel check-in."],
      ["Gangtok", "Tsomgo Lake and New Baba Mandir", "Permit-dependent excursion; alternate sightseeing if closed by weather or road conditions."],
      ["Darjeeling", "Transfer to Darjeeling", "Hotel check-in and time at leisure."],
      ["Darjeeling", "Tiger Hill and local sightseeing", "Tiger Hill subject to token; Himalayan Mountaineering Institute, zoo, Tenzing Rock, refugee centre, tea garden and Peace Pagoda."],
      ["Bagdogra", "Departure", "Daytime airport transfer with road-condition buffer."],
    ],
    hotels: [["Gangtok", "Maple Residency or similar", "Executive room", "Breakfast and dinner", "Nights 1–2"], ["Darjeeling", "Sumi Vista or similar", "Premium Kanchenjunga view", "Breakfast and dinner", "Nights 3–4"]],
    routes: [["Bagdogra Airport", "Gangtok", "WagonR or similar; point-to-point"], ["Gangtok", "Tsomgo Lake / Baba Mandir", "Innova/Xylo or suitable permitted equivalent; confirm current vehicle"], ["Gangtok", "Darjeeling", "Sector transfer; vehicle can change"], ["Darjeeling", "Darjeeling sights", "Local sightseeing"], ["Darjeeling", "Bagdogra Airport", "Departure transfer"]],
    options: [["Luxury hotel plan", 58000, "Breakfast and dinner (MAP)"]],
    includes: ["Listed accommodation and meals", "Non-AC point-to-point transfers and sightseeing", "Listed permit fees and hotel taxes"],
    excludes: ["Air and train fare, insurance and personal expenses", "Paid ropeway, additional sightseeing, entrance fees and guides", "Unplanned route costs, room heater where chargeable and sustainability fees"],
    terms: "Source lists tiered cancellation charges. Confirm current rates, name/arrival requirements, permit eligibility and closures before use.",
    extras: [["Nathula Pass", 5500, "Total", "Indicative per car before applicable tax; requires permit, road access and an open travel day."], ["Darjeeling Toy Train", 1600, "Per person", "Source fare before tax; separate vehicle waiting charge may apply."]],
  },
  {
    key: "himachal", name: "Shimla and Manali honeymoon", destination: "Manali and Shimla", duration: "6 days / 5 nights",
    days: [
      ["Shimla", "Chandigarh to Shimla", "Railway station pickup and road transfer."],
      ["Shimla", "Kufri and Shimla sights", "Kufri, the Mall, Christ Church, Scandal Point and local heritage sights."],
      ["Manali", "Shimla to Manali", "Drive via Sundernagar and Kullu Valley."],
      ["Manali", "Local Manali sights", "Hadimba, Manu Temple, Vashisht, Van Vihar and market."],
      ["Manali", "Solang Valley and Atal Tunnel", "Excursion depends on roads. Rohtang is a separate guest-paid option subject to permit and seasonal closures."],
      ["Chandigarh", "Departure to Chandigarh", "Road transfer to Chandigarh Railway Station."],
    ],
    hotels: [["Shimla", "Woodrina or similar", "Deluxe room", "Breakfast and dinner", "Nights 1–2"], ["Manali", "A Star Regency or similar", "Deluxe room", "Breakfast and dinner", "Nights 3–5"]],
    routes: [["Chandigarh Railway Station", "Shimla", "Sedan transfer"], ["Shimla", "Kufri / Shimla", "Local sedan sightseeing"], ["Shimla", "Manali", "Sedan via Kullu"], ["Manali", "Solang Valley / Atal Tunnel", "Weather-dependent excursion"], ["Manali", "Chandigarh Railway Station", "Sedan drop"]],
    options: [["Deluxe couple package", 39600, "Breakfast and dinner (MAP)"]],
    includes: ["Sedan, itinerary sightseeing and listed accommodation", "Listed meals", "Source mentions under-five child without extra bed; verify current policy"],
    excludes: ["Entry fees, guide, heater, personal expenses and insurance", "Guest-paid Rohtang permit/transport", "Weather-related or unlisted services"],
    terms: "Confirm current cancellation, seasonal access and permit rules before issuing a quotation.",
  },
];

export const demoPackages = sources.map((source) => {
  const content = quoteContentSchema.parse({
    title: source.name, destinations: source.destination, dateScope: "Indicative", currency: "INR",
    summary: `${source.duration}. Honeymoon plan for two in the reference. Sample rates and availability need review.`,
    services: ["Accommodation", "Car / transfer", "Activities", ...(source.key === "andaman" ? ["Ferry / boat"] : [])],
    itinerary: source.days.map(([city, title, activities], i) => ({ id: `day-${i + 1}`, day: i + 1, city, title, activities })),
    stays: source.hotels.map(([city, property, roomType, mealPlan, notes, option], i) => ({
      id: `stay-${i + 1}`, optionId: option === undefined ? "" : `option-${option + 1}`, city, property, roomType, mealPlan, notes, rooms: 1, occupancy: "Double",
    })),
    transport: source.routes.map(([from, to, details, mode = "Car"], i) => ({
      id: `leg-${i + 1}`, from, to, details, mode, responsibility: "Agency arranged", timeZone: "Asia/Kolkata",
    })),
    options: source.options.map(([name, price, mealPlan], i) => ({
      id: `option-${i + 1}`, name, mealPlan, priceBasis: "Per couple", unitPrice: String(price), quantity: 1,
    })),
    optionalExtras: (source.extras || []).map(([name, price, priceBasis, description], i) => ({
      id: `extra-${i + 1}`, name, price: String(price), priceBasis, description,
    })),
    inclusions: source.includes, exclusions: source.excludes, cancellationTerms: source.terms,
  });
  return { key: source.key, name: `${source.name} · ${source.duration}`, destination: source.destination, content };
});
