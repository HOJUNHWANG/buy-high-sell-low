export type FictionalSector =
  | "Aerospace & Defense"
  | "Artificial Intelligence"
  | "Biotech"
  | "Consumer"
  | "Cybernetics"
  | "Energy"
  | "Finance"
  | "Industrial"
  | "Media"
  | "Megacorp"
  | "Security"
  | "Space"
  | "Telecom"
  | "Transportation";

export type FictionalRisk =
  | "Low"
  | "Moderate"
  | "High"
  | "Extreme"
  | "Existential";

export type FictionalCompany = {
  ticker: string;
  name: string;
  source: string;
  sector: FictionalSector;
  exchange: "FICTDAQ" | "OMNI" | "NSE" | "LUNA";
  marketCap: number;
  basePrice: number;
  floatShares: number;
  volatility: number;
  risk: FictionalRisk;
  influence: number;
  technology: number;
  color: string;
  accent: string;
  note: string;
};

export type FictionalSnapshot = FictionalCompany & {
  price: number;
  changePct: number;
  volume: number;
  peRatio: number | null;
  dividendYield: number | null;
  news: string;
  sparkline: number[];
};

export type FictionalMarketEvent = {
  ticker: string;
  headline: string;
  impactPct: number;
  severity: "routine" | "material" | "chaotic";
};

const fictionalCompanyProfiles: Record<string, string> = {
  ARSK: "Sells private armies, executive protection, and neural cyberware; its influence comes from security pacts with governments and corporate city-states.",
  MLTC: "Builds conventional weapons, drones, and battlefield logistics networks; long defense procurement cycles make it a power broker across the exchange.",
  KTAO: "Specializes in smart firearms, targeting optics, and tactical AI; export contracts make it the agile challenger to larger defense primes.",
  BTEC: "Controls synthetic food, designer crops, and gene-patent licensing; its supply contracts give it leverage over dense urban populations.",
  TRMA: "Operates armed emergency extraction memberships and trauma clinics; rapid-response fleets turn healthcare access into a premium security product.",
  ZETA: "Makes cyberdecks, personal implants, and intrusion software; its developer ecosystem keeps it central to the consumer augmentation market.",
  NITE: "Owns urban infrastructure, real-estate systems, and municipal automation; its influence is concentrated in the operating layer beneath major cities.",
  PCHM: "Combines fuel refining, industrial agriculture, and protected supply routes; dependable necessities give it durable bargaining power.",
  STK: "Commercializes arc-energy, advanced aerospace, and precision defense platforms; frontier patents make it the market's benchmark innovation supplier.",
  OSCP: "Runs experimental therapeutics, performance enhancers, and genetic research; blockbuster upside is balanced by a volatile clinical and legal record.",
  ROXX: "Operates energy extraction, grids, and deep-resource concessions; it is influential through infrastructure control rather than technological leadership.",
  PYMN: "Develops size-manipulation science for medicine, materials, and logistics; scarce know-how gives it exceptional optionality and equally exceptional risk.",
  WNTE: "Diversifies across transit, applied science, aerospace, and civic projects; its philanthropic and industrial footprint makes it a stabilizing blue chip.",
  LEX: "Sells autonomous systems, data platforms, and defense intelligence; its scale comes from licensing critical AI to both industry and government.",
  QCON: "Produces heavy equipment, construction systems, and industrial materials; its value lies in reliable physical infrastructure rather than spectacle.",
  KORD: "Builds robotics, compact vehicles, and experimental mobility gear; a deep engineering bench gives it influence in specialized procurement markets.",
  WYUT: "Operates interstellar freight, terraforming, colony services, and security assets; control of long-haul routes makes it indispensable to off-world trade.",
  TYRL: "Manufactures high-end synthetic humans and cognition platforms; its prestige rests on lifelike AI that serves premium labor and companion markets.",
  WLLC: "Pairs food security systems with synthetic labor and off-world agriculture; vertical integration gives it unusual pricing power across settlement economies.",
  OCP: "Bundles policing technology, municipal services, consumer goods, and redevelopment finance; privatized public infrastructure drives its political clout.",
  CYBD: "Develops autonomous defense software, industrial robotics, and machine-learning cores; its strategic value is high because every buyer depends on safe deployment.",
  APTR: "Licenses portal transport, automated testing, and experimental facility systems; its technology is unmatched but commercialization remains tightly regulated.",
  BMSA: "Runs advanced physics labs, materials programs, and hazardous research contracts; national-security funding keeps it relevant despite containment costs.",
  VLTC: "Sells civil-defense shelters, continuity services, and sealed-habitat consumer products; fear-driven demand gives it a resilient disaster economy.",
  GBRL: "Supplies household robots, nuclear appliances, and defense automation; a huge installed base makes service parts and upgrades a steady annuity.",
  WSTR: "Develops military pharmaceuticals, radiation therapies, and enhancement compounds; its research portfolio commands attention from both health and defense buyers.",
  UMBR: "Controls global pharmaceuticals, vaccines, and high-containment biotech; its influence comes from emergency supply chains and proprietary pathogen research.",
  TRCL: "Markets agricultural biotech, pharmaceuticals, and frontier therapeutics; regional distribution partnerships make it a consequential emerging-market operator.",
  SHRA: "Generates power, operates industrial cities, and monetizes energy infrastructure; exchange rules curb monopoly power but its grid remains systemically important.",
  RUFU: "Runs regional generation and transmission assets; it competes on reliability, local concessions, and lower-cost alternatives to dominant utilities.",
  ABST: "Sells consumer devices, identity archives, and memory-simulation platforms; its data vaults make it an influential gatekeeper of personal history.",
  HLPR: "Produces weapons, loaders, and orbital industrial equipment; vertically integrated manufacturing makes it a major supplier to frontier settlements.",
  ATLS: "Builds military hardware, survey systems, and expedition gear; a modernized product line keeps it competitive in the high-end arms market.",
  MLWN: "Sells elemental weapon platforms, energy cells, and targeting systems; distinctive energy engineering gives it pricing power with security contractors.",
  DAHL: "Provides standardized military equipment, mining hardware, and colony infrastructure; disciplined operations make it a dependable procurement name.",
  JAKB: "Crafts premium ballistic weapons and heirloom-grade components; brand loyalty and craftsmanship anchor a profitable luxury defense niche.",
  UAC: "Operates Mars energy projects, aerospace research, and dimensional power experiments; rare energy access makes it strategically vital under strict oversight.",
  TRIO: "Builds space-station systems, neural interfaces, and autonomous operations software; its contracts sit at the center of high-orbit infrastructure.",
  BNLG: "Runs retail, logistics, finance, housing, and media platforms; its scale comes from everyday distribution rather than any single monopoly privilege.",
  CYLF: "Manufactures consumer androids, service intelligence, and home automation; its installed base gives it a central role in the labor-transition economy.",
  FICS: "Delivers automated factories, resource processing, and remote construction systems; it converts undeveloped worlds into productive industrial networks.",
  ALTR: "Supplies survival technology, ocean-world habitats, and exploration services; frontier settlement contracts give it influence beyond its consumer brand.",
  RDA: "Finances interstellar mining, transport, and extraction equipment; access to scarce off-world materials makes it a heavyweight in commodity markets.",
  INGN: "Licenses de-extinction genetics, veterinary biotech, and controlled wildlife parks; proprietary genomes give it a rare entertainment-and-science moat.",
  MSRN: "Operates destination resorts, telecom holdings, and experiential travel; its reach comes from owning the visitor economy around premium biotech attractions.",
  SYLT: "Produces mass-market nutrition, food processing, and scarcity logistics; enormous distribution networks make it a key supplier during supply shocks.",
  BSUN: "Distributes consumer goods, pharmaceuticals, and communications across settled systems; ubiquity gives it a strong but regulated distribution franchise.",
  NRVN: "Develops existential-defense systems, bio-mechanical platforms, and disaster command infrastructure; government reliance makes it strategically important but tightly supervised.",
  CPSL: "Sells capsule storage, portable vehicles, and compact consumer hardware; breakthrough miniaturization turns ordinary retail products into category leaders.",
  SILV: "Builds personal devices, communications tools, and creature-care technology; a broad device ecosystem gives it durable consumer network effects.",
  DVON: "Manufactures research instruments, industrial devices, and regional technology products; local engineering leadership supports steady enterprise demand.",
  MCRP: "Controls manufacturing, consumer brands, logistics, and entertainment assets; diversified cash flows make it influential despite governance volatility.",
  DOATEC: "Develops industrial robotics, biometric systems, and advanced materials; niche R&D programs give it a reputation for technically difficult contracts.",
  SCT: "Builds prosthetics, neural augmentations, and rehabilitation platforms; clinical partnerships make it a major voice in human-augmentation standards.",
  THYT: "Produces smart prosthetics, medical implants, and surgical systems; hospital adoption makes it a key competitor in regulated augmentation care.",
  PICU: "Operates private banking, risk intelligence, and surveillance services; its power comes from connecting capital flows to high-value information.",
  MSTR: "Runs behavioral research, media monitoring, and remote-health platforms; controversial data practices create both a valuable dataset and permanent scrutiny.",
  BRAN: "Provides orbital hospitality, passenger services, and spaceflight infrastructure; prestige travel contracts make it a recognizable civilian-space operator.",
  PANAM: "Operates passenger routes, cargo links, and lunar transfer services; broad route rights give it a visible role in the interplanetary travel economy.",
  CHOAM: "Clears interplanetary trade, commodity finance, and long-term supply contracts; its influence is financial, mediated by member houses and exchange rules.",
  IX: "Develops high-performance machines, navigation hardware, and precision manufacturing; specialist engineering gives it leverage over advanced industrial supply chains.",
  RCHS: "Designs luxury electronics, sensor systems, and bespoke engineering; elite clients support a high-margin technology niche.",
  GRNG: "Offers secure vaulting, payment rails, and custody for rare assets; trusted settlement infrastructure makes it a financial anchor across jurisdictions.",
  WWZ: "Produces enchanted consumer devices, communications tools, and education products; practical magical hardware gives it broad household reach.",
  ACME: "Sells mass-market tools, novelty hardware, and experimental consumer products; unmatched catalog breadth makes it a resilient, unpredictable retailer.",
  SPCT: "Manufactures spacefaring components, propulsion parts, and orbital industrial tools; long supplier relationships keep it embedded in civilian aerospace.",
  COGS: "Builds mechanical components, automation modules, and industrial machinery; dependable commodity engineering supports a defensive manufacturing profile.",
  GLOB: "Runs consumer electronics, biotech ventures, and workplace technology; broad innovation spending gives it influence across several regulated sectors.",
  MOMC: "Sells automated childcare, household systems, and family robotics; a trusted consumer brand makes it a powerful channel into home automation.",
  PLNT: "Operates independent freight, package delivery, and interplanetary logistics; flexible routes make it the scrappy alternative to major carriers.",
  SLRM: "Owns beverage brands, entertainment tie-ins, and distribution rights; cultural reach and repeat purchases drive a classic consumer franchise.",
  VIRN: "Develops mood products, entertainment technology, and consumer health goods; its influence comes from owning attention-heavy lifestyle categories.",
  NKTN: "Manages commercial towers, regional trade finance, and international property; prime real-estate assets give it quiet leverage over business districts.",
  PRGN: "Runs shipping, port logistics, and leisure transport; control of regional cargo corridors makes it a cyclical but important mobility name.",
  LSTR: "Operates social platforms, advertising systems, and personal-data services; network effects make it influential despite intense privacy oversight.",
  BILK: "Researches pharmaceuticals, consumer chemistry, and advanced materials; its returns depend on a deep patent pipeline and long product cycles.",
  MRYW: "Provides private security, maritime protection, and tactical logistics; government-adjacent contracts make it a consequential defense-services contractor.",
  FDRP: "Builds mass-effect propulsion, ship cores, and deep-space systems; foundational propulsion patents make it essential to interstellar fleet builders.",
  EXGN: "Develops frontier-world extraction, xenobiology, and resource surveys; first-mover access to remote assets drives its speculative appeal.",
  ELNS: "Sells insurance, risk analytics, and security coordination for off-world operators; it prices the hazards other corporations prefer to ignore.",
  RSRC: "Supplies strategic materials, industrial alloys, and defense inputs; secured mining contracts give it leverage during construction booms.",
  MRDN: "Builds clean-energy systems, terraforming tools, and automated infrastructure; recovery contracts make it a core supplier to rebuilding regions.",
  FRZN: "Produces autonomous construction machines, industrial robots, and environmental systems; its automation stack is valuable where labor is scarce.",
  MSSV: "Operates launch research, observatories, and space-science programs; public-private missions make it a key gateway to regional orbital access.",
  DYN: "Develops cyberware, security software, and advanced electronics; specialist integration work gives it a strong position in augmented infrastructure.",
  RENK: "Builds enterprise networks, robotics, and corporate security systems; entrenched clients make it a durable platform provider across urban markets.",
  AZTC: "Controls agriculture, consumer brands, biotech, and financial services; diversified regional operations give it broad influence without unchecked rule.",
  SAKR: "Operates heavy industry, aerospace, security technology, and data systems; engineering scale makes it one of the market's most formidable conglomerates.",
  AZT: "Produces fuel, chemicals, and industrial feedstocks; refinery and pipeline assets make it important to energy-intensive sectors.",
  MNMC: "Develops robotics, AI platforms, and security hardware; its influence stems from supplying the automation backbone to other corporations.",
  HRSN: "Builds planetary infrastructure, worker habitats, and aerospace systems; corporate-city development makes it a major real-assets operator.",
  ARCC: "Runs planetwide commerce, real estate, and urban services; dense commercial districts give it powerful recurring revenue and tenant data.",
  RSI: "Designs civilian spacecraft, exploration vessels, and ship components; a broad owner community makes it a bellwether for personal spaceflight.",
  ANVL: "Produces military spacecraft, armored vehicles, and defense avionics; procurement relationships keep it central to fleet modernization.",
  MISC: "Builds freight ships, industrial haulers, and efficient power systems; practical utility gives it a dependable role in the logistics economy.",
  CZKA: "Supplies mining equipment, security hardware, and frontier development services; legacy contracts make it influential in remote resource zones.",
  KDYD: "Constructs capital ships, orbital yards, and heavy propulsion assemblies; shipyard capacity gives it strategic weight in every fleet cycle.",
  SFSY: "Builds fighters, surveillance craft, and military aerospace systems; specialized defense design supports a premium procurement business.",
  INCM: "Designs agile starfighters, avionics, and civilian aerospace technology; engineering reputation gives it a strong challenger position in space hardware.",
  CEC: "Operates deep-space extraction, heavy equipment, and colony support services; its industrial fleet makes it a vital but hazardous resource supplier.",
};

export function getFictionalCompanyProfile(ticker: string, fallback: string) {
  return fictionalCompanyProfiles[ticker] ?? fallback;
}

const T = 1_000_000_000_000;
const B = 1_000_000_000;

const rawFictionalCompanies: FictionalCompany[] = [
  { ticker: "ARSK", name: "Arasaka Corporation", source: "Cyberpunk", sector: "Security", exchange: "FICTDAQ", marketCap: 2.4*T, basePrice: 742.18, floatShares: 3.23*B, volatility: 2.9, risk: "Extreme", influence: 98, technology: 94, color: "#ef4444", accent: "#111827", note: "Private armies, cyberware, and sovereign-level political reach." },
  { ticker: "MLTC", name: "Militech International", source: "Cyberpunk", sector: "Aerospace & Defense", exchange: "OMNI", marketCap: 1.9*T, basePrice: 418.62, floatShares: 4.54*B, volatility: 2.5, risk: "High", influence: 95, technology: 89, color: "#22c55e", accent: "#0f172a", note: "Defense contracts keep the top line heavy and morally complicated." },
  { ticker: "KTAO", name: "Kang Tao", source: "Cyberpunk", sector: "Aerospace & Defense", exchange: "FICTDAQ", marketCap: 420*B, basePrice: 128.44, floatShares: 3.27*B, volatility: 2.1, risk: "High", influence: 78, technology: 88, color: "#f97316", accent: "#1f2937", note: "Smart weapons give it a premium multiple despite export scrutiny." },
  { ticker: "BTEC", name: "Biotechnica", source: "Cyberpunk", sector: "Biotech", exchange: "FICTDAQ", marketCap: 690*B, basePrice: 213.77, floatShares: 3.23*B, volatility: 2.2, risk: "High", influence: 82, technology: 91, color: "#84cc16", accent: "#052e16", note: "Synthetic food and genetic patents are a recession-resistant nightmare." },
  { ticker: "TRMA", name: "Trauma Team International", source: "Cyberpunk", sector: "Security", exchange: "OMNI", marketCap: 310*B, basePrice: 96.35, floatShares: 3.22*B, volatility: 1.8, risk: "Moderate", influence: 76, technology: 82, color: "#06b6d4", accent: "#083344", note: "Subscription emergency response with unusually aggressive churn recovery." },
  { ticker: "ZETA", name: "Zetatech", source: "Cyberpunk", sector: "Cybernetics", exchange: "FICTDAQ", marketCap: 360*B, basePrice: 144.08, floatShares: 2.5*B, volatility: 2.4, risk: "High", influence: 71, technology: 86, color: "#a855f7", accent: "#18181b", note: "Cyberdeck demand gives the company a persistent enthusiast premium." },
  { ticker: "NITE", name: "Night Corp", source: "Cyberpunk", sector: "Megacorp", exchange: "OMNI", marketCap: 880*B, basePrice: 275.16, floatShares: 3.2*B, volatility: 2.0, risk: "High", influence: 89, technology: 79, color: "#38bdf8", accent: "#020617", note: "City-scale infrastructure exposure, opaque governance, excellent margins." },
  { ticker: "PCHM", name: "Petrochem", source: "Cyberpunk", sector: "Energy", exchange: "OMNI", marketCap: 1.1*T, basePrice: 352.41, floatShares: 3.12*B, volatility: 1.9, risk: "High", influence: 90, technology: 72, color: "#f59e0b", accent: "#1c1917", note: "Fuel, farms, and security escorts make a strangely durable mix." },
  { ticker: "STK", name: "Stark Industries", source: "Marvel", sector: "Aerospace & Defense", exchange: "FICTDAQ", marketCap: 3.7*T, basePrice: 1208.44, floatShares: 3.06*B, volatility: 3.1, risk: "Extreme", influence: 97, technology: 99, color: "#fbbf24", accent: "#991b1b", note: "Arc reactor optionality justifies a heroic valuation premium." },
  { ticker: "OSCP", name: "Oscorp Industries", source: "Marvel", sector: "Biotech", exchange: "FICTDAQ", marketCap: 620*B, basePrice: 188.19, floatShares: 3.29*B, volatility: 3.6, risk: "Extreme", influence: 78, technology: 92, color: "#16a34a", accent: "#581c87", note: "Breakthrough pipeline, uncomfortable incident history, very lively lawsuits." },
  { ticker: "ROXX", name: "Roxxon Energy", source: "Marvel", sector: "Energy", exchange: "OMNI", marketCap: 1.3*T, basePrice: 301.55, floatShares: 4.31*B, volatility: 2.2, risk: "High", influence: 92, technology: 76, color: "#2563eb", accent: "#111827", note: "A classic oil major with a suspiciously supernatural risk footnote." },
  { ticker: "PYMN", name: "Pym Technologies", source: "Marvel", sector: "Biotech", exchange: "FICTDAQ", marketCap: 540*B, basePrice: 246.03, floatShares: 2.2*B, volatility: 3.7, risk: "Extreme", influence: 70, technology: 99, color: "#ef4444", accent: "#0f172a", note: "Shrinking addressable markets has never sounded more bullish." },
  { ticker: "WNTE", name: "Wayne Enterprises", source: "DC", sector: "Megacorp", exchange: "OMNI", marketCap: 2.8*T, basePrice: 612.70, floatShares: 4.57*B, volatility: 1.3, risk: "Moderate", influence: 96, technology: 87, color: "#64748b", accent: "#020617", note: "A diversified compounder with unusual nighttime capex patterns." },
  { ticker: "LEX", name: "LexCorp", source: "DC", sector: "Artificial Intelligence", exchange: "FICTDAQ", marketCap: 1.7*T, basePrice: 508.22, floatShares: 3.35*B, volatility: 2.7, risk: "Extreme", influence: 94, technology: 96, color: "#22c55e", accent: "#111827", note: "AI, defense, and ego-driven R&D keep analysts awake." },
  { ticker: "QCON", name: "Queen Consolidated", source: "DC", sector: "Industrial", exchange: "OMNI", marketCap: 280*B, basePrice: 77.54, floatShares: 3.61*B, volatility: 1.7, risk: "Moderate", influence: 67, technology: 72, color: "#10b981", accent: "#064e3b", note: "Old economy assets with enough applied science to stay relevant." },
  { ticker: "KORD", name: "Kord Industries", source: "DC", sector: "Cybernetics", exchange: "FICTDAQ", marketCap: 190*B, basePrice: 63.80, floatShares: 2.98*B, volatility: 2.0, risk: "Moderate", influence: 61, technology: 83, color: "#3b82f6", accent: "#0f172a", note: "Robotics upside, founder-key-person risk, charming balance sheet." },
  { ticker: "WYUT", name: "Weyland-Yutani", source: "Alien", sector: "Space", exchange: "LUNA", marketCap: 4.6*T, basePrice: 884.02, floatShares: 5.2*B, volatility: 3.4, risk: "Existential", influence: 100, technology: 97, color: "#94a3b8", accent: "#111827", note: "Terraforming, freight, weapons, and biology best left off the call." },
  { ticker: "TYRL", name: "Tyrell Corporation", source: "Blade Runner", sector: "Artificial Intelligence", exchange: "FICTDAQ", marketCap: 1.5*T, basePrice: 449.90, floatShares: 3.33*B, volatility: 2.8, risk: "Extreme", influence: 88, technology: 98, color: "#facc15", accent: "#1f2937", note: "Premium android margins with a very short product lifecycle." },
  { ticker: "WLLC", name: "Wallace Corporation", source: "Blade Runner", sector: "Biotech", exchange: "FICTDAQ", marketCap: 2.1*T, basePrice: 530.11, floatShares: 3.96*B, volatility: 2.6, risk: "Extreme", influence: 91, technology: 98, color: "#eab308", accent: "#292524", note: "Food systems and synthetic labor make a grim vertically integrated empire." },
  { ticker: "OCP", name: "Omni Consumer Products", source: "RoboCop", sector: "Security", exchange: "OMNI", marketCap: 970*B, basePrice: 232.88, floatShares: 4.16*B, volatility: 2.4, risk: "Extreme", influence: 86, technology: 84, color: "#60a5fa", accent: "#111827", note: "Privatized city services create cash flow and constant scandal." },
  { ticker: "CYBD", name: "Cyberdyne Systems", source: "Terminator", sector: "Artificial Intelligence", exchange: "FICTDAQ", marketCap: 780*B, basePrice: 318.64, floatShares: 2.45*B, volatility: 4.1, risk: "Existential", influence: 81, technology: 99, color: "#ef4444", accent: "#0f172a", note: "The market is pricing in automation and not pricing in enough else." },
  { ticker: "APTR", name: "Aperture Science", source: "Portal", sector: "Artificial Intelligence", exchange: "FICTDAQ", marketCap: 260*B, basePrice: 74.11, floatShares: 3.51*B, volatility: 3.8, risk: "Extreme", influence: 60, technology: 95, color: "#f97316", accent: "#1e293b", note: "Testing revenue is unclear; portal moat is obvious." },
  { ticker: "BMSA", name: "Black Mesa", source: "Half-Life", sector: "Biotech", exchange: "NSE", marketCap: 390*B, basePrice: 66.60, floatShares: 5.86*B, volatility: 4.3, risk: "Existential", influence: 74, technology: 97, color: "#f97316", accent: "#111827", note: "Research campus valuation includes a generous dimensional-risk discount." },
  { ticker: "VLTC", name: "Vault-Tec Corporation", source: "Fallout", sector: "Consumer", exchange: "OMNI", marketCap: 710*B, basePrice: 111.76, floatShares: 6.35*B, volatility: 2.9, risk: "Extreme", influence: 89, technology: 79, color: "#facc15", accent: "#1d4ed8", note: "Bunker pre-sales are countercyclical in the most literal way." },
  { ticker: "GBRL", name: "General Atomics International", source: "Fallout", sector: "Cybernetics", exchange: "FICTDAQ", marketCap: 480*B, basePrice: 98.40, floatShares: 4.88*B, volatility: 2.1, risk: "High", influence: 76, technology: 86, color: "#14b8a6", accent: "#0f172a", note: "Household automation with defense-grade attachment rates." },
  { ticker: "WSTR", name: "West Tek", source: "Fallout", sector: "Biotech", exchange: "NSE", marketCap: 240*B, basePrice: 58.32, floatShares: 4.12*B, volatility: 3.5, risk: "Extreme", influence: 63, technology: 88, color: "#84cc16", accent: "#111827", note: "Pharma investors love the pipeline and hate the spillover effects." },
  { ticker: "UMBR", name: "Umbrella Corporation", source: "Resident Evil", sector: "Biotech", exchange: "FICTDAQ", marketCap: 860*B, basePrice: 172.09, floatShares: 5.0*B, volatility: 4.0, risk: "Existential", influence: 88, technology: 93, color: "#ef4444", accent: "#f8fafc", note: "Pharmaceutical scale with outbreak-adjusted governance discount." },
  { ticker: "TRCL", name: "Tricell", source: "Resident Evil", sector: "Biotech", exchange: "OMNI", marketCap: 340*B, basePrice: 86.45, floatShares: 3.93*B, volatility: 3.1, risk: "Extreme", influence: 70, technology: 86, color: "#f59e0b", accent: "#111827", note: "Africa growth story, ethically radioactive product portfolio." },
  { ticker: "SHRA", name: "Shinra Electric Power Company", source: "Final Fantasy VII", sector: "Energy", exchange: "OMNI", marketCap: 2.6*T, basePrice: 512.77, floatShares: 5.07*B, volatility: 2.7, risk: "Extreme", influence: 99, technology: 93, color: "#22c55e", accent: "#0f172a", note: "Mako monopoly supports cash flow until planet risk gets repriced." },
  { ticker: "RUFU", name: "Rufus Electric", source: "Final Fantasy VII", sector: "Energy", exchange: "NSE", marketCap: 120*B, basePrice: 31.18, floatShares: 3.85*B, volatility: 2.3, risk: "High", influence: 54, technology: 68, color: "#a3e635", accent: "#111827", note: "A smaller utility trying to survive under a very large shadow." },
  { ticker: "ABST", name: "Abstergo Industries", source: "Assassin's Creed", sector: "Artificial Intelligence", exchange: "FICTDAQ", marketCap: 1.2*T, basePrice: 287.32, floatShares: 4.18*B, volatility: 2.9, risk: "Extreme", influence: 93, technology: 91, color: "#e5e7eb", accent: "#111827", note: "Consumer tech, ancestry data, and too much historical optionality." },
  { ticker: "HLPR", name: "Hyperion Corporation", source: "Borderlands", sector: "Aerospace & Defense", exchange: "LUNA", marketCap: 910*B, basePrice: 222.12, floatShares: 4.1*B, volatility: 3.2, risk: "Extreme", influence: 84, technology: 89, color: "#facc15", accent: "#111827", note: "Weapons, loaders, and customer service with orbital escalation." },
  { ticker: "ATLS", name: "Atlas Corporation", source: "Borderlands", sector: "Aerospace & Defense", exchange: "LUNA", marketCap: 760*B, basePrice: 191.04, floatShares: 3.98*B, volatility: 2.8, risk: "High", influence: 81, technology: 87, color: "#38bdf8", accent: "#0f172a", note: "A rebooted arms platform with improved targeting and investor relations." },
  { ticker: "MLWN", name: "Maliwan", source: "Borderlands", sector: "Aerospace & Defense", exchange: "LUNA", marketCap: 640*B, basePrice: 155.33, floatShares: 4.12*B, volatility: 3.0, risk: "High", influence: 78, technology: 88, color: "#ec4899", accent: "#1e293b", note: "Elemental weapons drive high margins and higher accident reserves." },
  { ticker: "DAHL", name: "Dahl Corporation", source: "Borderlands", sector: "Aerospace & Defense", exchange: "LUNA", marketCap: 520*B, basePrice: 119.72, floatShares: 4.34*B, volatility: 2.4, risk: "High", influence: 73, technology: 80, color: "#16a34a", accent: "#172554", note: "Disciplined military supplier with a complicated labor footprint." },
  { ticker: "JAKB", name: "Jakobs", source: "Borderlands", sector: "Aerospace & Defense", exchange: "LUNA", marketCap: 210*B, basePrice: 64.25, floatShares: 3.27*B, volatility: 2.0, risk: "Moderate", influence: 58, technology: 66, color: "#a16207", accent: "#1c1917", note: "Premium craftsmanship, slow innovation, loyal buyers." },
  { ticker: "UAC", name: "Union Aerospace Corporation", source: "Doom", sector: "Space", exchange: "LUNA", marketCap: 1.6*T, basePrice: 410.66, floatShares: 3.9*B, volatility: 4.2, risk: "Existential", influence: 91, technology: 97, color: "#dc2626", accent: "#111827", note: "Mars energy assets trade at a discount to portal-related liabilities." },
  { ticker: "TRIO", name: "TriOptimum Corporation", source: "System Shock", sector: "Artificial Intelligence", exchange: "FICTDAQ", marketCap: 980*B, basePrice: 251.42, floatShares: 3.9*B, volatility: 3.7, risk: "Existential", influence: 86, technology: 98, color: "#8b5cf6", accent: "#020617", note: "A space station operator whose AI risk committee needs supervision." },
  { ticker: "BNLG", name: "Buy n Large", source: "WALL-E", sector: "Consumer", exchange: "OMNI", marketCap: 5.2*T, basePrice: 689.14, floatShares: 7.55*B, volatility: 1.8, risk: "Extreme", influence: 100, technology: 85, color: "#ef4444", accent: "#f8fafc", note: "Retail, logistics, media, banking, housing, and possibly civilization." },
  { ticker: "CYLF", name: "CyberLife", source: "Detroit: Become Human", sector: "Artificial Intelligence", exchange: "FICTDAQ", marketCap: 1.4*T, basePrice: 336.21, floatShares: 4.16*B, volatility: 3.3, risk: "Extreme", influence: 87, technology: 98, color: "#38bdf8", accent: "#020617", note: "Android install base is enormous; labor politics are not priced cleanly." },
  { ticker: "FICS", name: "FICSIT Inc.", source: "Satisfactory", sector: "Industrial", exchange: "LUNA", marketCap: 580*B, basePrice: 177.88, floatShares: 3.26*B, volatility: 2.2, risk: "High", influence: 72, technology: 86, color: "#f97316", accent: "#111827", note: "Automation capex turns remote planets into EBITDA." },
  { ticker: "ALTR", name: "Alterra Corporation", source: "Subnautica", sector: "Space", exchange: "LUNA", marketCap: 720*B, basePrice: 189.12, floatShares: 3.81*B, volatility: 2.5, risk: "High", influence: 79, technology: 90, color: "#06b6d4", accent: "#082f49", note: "Ocean worlds, survival gear, and an aggressive invoice department." },
  { ticker: "RDA", name: "Resources Development Administration", source: "Avatar", sector: "Industrial", exchange: "OMNI", marketCap: 3.1*T, basePrice: 640.08, floatShares: 4.84*B, volatility: 3.0, risk: "Extreme", influence: 96, technology: 92, color: "#2563eb", accent: "#0f172a", note: "Interstellar resource extraction with headline risk measured in moons." },
  { ticker: "INGN", name: "InGen", source: "Jurassic Park", sector: "Biotech", exchange: "FICTDAQ", marketCap: 450*B, basePrice: 132.65, floatShares: 3.39*B, volatility: 3.8, risk: "Extreme", influence: 75, technology: 95, color: "#16a34a", accent: "#111827", note: "De-extinction is a moat until it jumps the fence." },
  { ticker: "MSRN", name: "Masrani Global", source: "Jurassic World", sector: "Consumer", exchange: "OMNI", marketCap: 390*B, basePrice: 104.90, floatShares: 3.72*B, volatility: 2.7, risk: "High", influence: 71, technology: 82, color: "#22d3ee", accent: "#0f172a", note: "Theme parks, telecom, and preventable incident volatility." },
  { ticker: "SYLT", name: "Soylent Corporation", source: "Soylent Green", sector: "Consumer", exchange: "OMNI", marketCap: 610*B, basePrice: 88.01, floatShares: 6.93*B, volatility: 2.6, risk: "Extreme", influence: 84, technology: 58, color: "#22c55e", accent: "#064e3b", note: "Food scarcity tailwinds, unacceptable ingredient risk." },
  { ticker: "BSUN", name: "Blue Sun Corporation", source: "Firefly", sector: "Consumer", exchange: "LUNA", marketCap: 1.1*T, basePrice: 271.60, floatShares: 4.05*B, volatility: 2.1, risk: "High", influence: 92, technology: 80, color: "#2563eb", accent: "#f8fafc", note: "Ubiquitous consumer goods across the settled systems." },
  { ticker: "NRVN", name: "NERV", source: "Evangelion", sector: "Aerospace & Defense", exchange: "NSE", marketCap: 990*B, basePrice: 444.40, floatShares: 2.23*B, volatility: 4.5, risk: "Existential", influence: 90, technology: 99, color: "#7c3aed", accent: "#16a34a", note: "Defense monopoly with end-of-world event exposure." },
  { ticker: "CPSL", name: "Capsule Corporation", source: "Dragon Ball", sector: "Consumer", exchange: "FICTDAQ", marketCap: 2.0*T, basePrice: 398.57, floatShares: 5.02*B, volatility: 1.9, risk: "Moderate", influence: 88, technology: 99, color: "#38bdf8", accent: "#f8fafc", note: "A consumer tech giant with impossible storage density." },
  { ticker: "SILV", name: "Silph Co.", source: "Pokemon", sector: "Consumer", exchange: "FICTDAQ", marketCap: 520*B, basePrice: 121.95, floatShares: 4.26*B, volatility: 1.7, risk: "Moderate", influence: 76, technology: 82, color: "#ef4444", accent: "#f8fafc", note: "Device ecosystem has strong network effects and villain-attraction risk." },
  { ticker: "DVON", name: "Devon Corporation", source: "Pokemon", sector: "Industrial", exchange: "FICTDAQ", marketCap: 430*B, basePrice: 109.38, floatShares: 3.93*B, volatility: 1.8, risk: "Moderate", influence: 70, technology: 84, color: "#60a5fa", accent: "#1e293b", note: "R&D-heavy manufacturer with a durable regional franchise." },
  { ticker: "MCRP", name: "Mishima Zaibatsu", source: "Tekken", sector: "Megacorp", exchange: "OMNI", marketCap: 1.8*T, basePrice: 377.04, floatShares: 4.77*B, volatility: 3.2, risk: "Extreme", influence: 95, technology: 87, color: "#ef4444", accent: "#020617", note: "Global conglomerate valuation swings with family governance events." },
  { ticker: "DOATEC", name: "DOATEC", source: "Dead or Alive", sector: "Industrial", exchange: "OMNI", marketCap: 330*B, basePrice: 83.52, floatShares: 3.95*B, volatility: 2.4, risk: "High", influence: 66, technology: 86, color: "#0ea5e9", accent: "#111827", note: "Industrial R&D plus tournament marketing creates odd but loyal coverage." },
  { ticker: "SCT", name: "Sarif Industries", source: "Deus Ex", sector: "Cybernetics", exchange: "FICTDAQ", marketCap: 490*B, basePrice: 152.81, floatShares: 3.21*B, volatility: 2.8, risk: "High", influence: 75, technology: 92, color: "#f59e0b", accent: "#111827", note: "Human augmentation leader with messy regulatory catalysts." },
  { ticker: "THYT", name: "Tai Yong Medical", source: "Deus Ex", sector: "Cybernetics", exchange: "FICTDAQ", marketCap: 560*B, basePrice: 163.44, floatShares: 3.43*B, volatility: 2.4, risk: "High", influence: 78, technology: 91, color: "#22c55e", accent: "#052e16", note: "Scale advantage in implants and equally scaled political entanglement." },
  { ticker: "PICU", name: "Picus Group", source: "Deus Ex", sector: "Media", exchange: "OMNI", marketCap: 300*B, basePrice: 69.72, floatShares: 4.3*B, volatility: 1.8, risk: "High", influence: 82, technology: 73, color: "#8b5cf6", accent: "#111827", note: "Media power with data assets that investors pretend not to notice." },
  { ticker: "MSTR", name: "Murkoff Corporation", source: "Outlast", sector: "Biotech", exchange: "NSE", marketCap: 210*B, basePrice: 47.13, floatShares: 4.46*B, volatility: 4.0, risk: "Existential", influence: 59, technology: 82, color: "#64748b", accent: "#111827", note: "Private research facilities and public-market nightmares." },
  { ticker: "BRAN", name: "Braniff International", source: "2001: A Space Odyssey", sector: "Transportation", exchange: "LUNA", marketCap: 180*B, basePrice: 44.80, floatShares: 4.02*B, volatility: 1.5, risk: "Moderate", influence: 62, technology: 76, color: "#f97316", accent: "#f8fafc", note: "Space travel nostalgia with practical route scarcity." },
  { ticker: "PANAM", name: "Pan Am Spaceways", source: "2001: A Space Odyssey", sector: "Transportation", exchange: "LUNA", marketCap: 260*B, basePrice: 59.31, floatShares: 4.38*B, volatility: 1.6, risk: "Moderate", influence: 69, technology: 81, color: "#2563eb", accent: "#f8fafc", note: "Orbital passenger traffic gives the old brand new lift." },
  { ticker: "CHOAM", name: "CHOAM", source: "Dune", sector: "Finance", exchange: "OMNI", marketCap: 6.4*T, basePrice: 1330.00, floatShares: 4.81*B, volatility: 2.6, risk: "Extreme", influence: 100, technology: 88, color: "#d97706", accent: "#1c1917", note: "A commerce monopoly levered to spice, politics, and prophecy." },
  { ticker: "IX", name: "Ixian Confederacy", source: "Dune", sector: "Artificial Intelligence", exchange: "OMNI", marketCap: 1.0*T, basePrice: 420.19, floatShares: 2.38*B, volatility: 2.7, risk: "High", influence: 82, technology: 98, color: "#0ea5e9", accent: "#111827", note: "Advanced machines command premium pricing and religious scrutiny." },
  { ticker: "RCHS", name: "Richese Combine", source: "Dune", sector: "Industrial", exchange: "OMNI", marketCap: 410*B, basePrice: 96.27, floatShares: 4.26*B, volatility: 2.0, risk: "Moderate", influence: 70, technology: 88, color: "#a3a3a3", accent: "#111827", note: "Precision manufacturing niche with imperial procurement upside." },
  { ticker: "GRNG", name: "Gringotts Bank", source: "Harry Potter", sector: "Finance", exchange: "OMNI", marketCap: 1.6*T, basePrice: 501.13, floatShares: 3.19*B, volatility: 1.4, risk: "High", influence: 92, technology: 77, color: "#facc15", accent: "#78350f", note: "Ancient custody business, deep vault moat, dragon-related operating cost." },
  { ticker: "WWZ", name: "WizzTech", source: "Harry Potter", sector: "Consumer", exchange: "NSE", marketCap: 160*B, basePrice: 39.44, floatShares: 4.06*B, volatility: 1.9, risk: "Moderate", influence: 55, technology: 72, color: "#8b5cf6", accent: "#111827", note: "Consumer magic gadgets, limited disclosure, strong back-to-school season." },
  { ticker: "ACME", name: "ACME Corporation", source: "Looney Tunes", sector: "Industrial", exchange: "OMNI", marketCap: 740*B, basePrice: 147.00, floatShares: 5.03*B, volatility: 2.6, risk: "Extreme", influence: 85, technology: 64, color: "#ef4444", accent: "#facc15", note: "Explosive SKU breadth and suspiciously persistent demand." },
  { ticker: "SPCT", name: "Spacely Space Sprockets", source: "The Jetsons", sector: "Industrial", exchange: "LUNA", marketCap: 360*B, basePrice: 92.12, floatShares: 3.91*B, volatility: 1.9, risk: "Moderate", influence: 68, technology: 80, color: "#38bdf8", accent: "#111827", note: "Old-school space manufacturing with strict boss-risk governance." },
  { ticker: "COGS", name: "Cogswell Cogs", source: "The Jetsons", sector: "Industrial", exchange: "LUNA", marketCap: 310*B, basePrice: 80.08, floatShares: 3.87*B, volatility: 2.0, risk: "Moderate", influence: 64, technology: 79, color: "#f97316", accent: "#111827", note: "A pure-play rival in a commodity that somehow remains strategic." },
  { ticker: "GLOB", name: "Globex Corporation", source: "The Simpsons", sector: "Megacorp", exchange: "OMNI", marketCap: 920*B, basePrice: 229.99, floatShares: 4.0*B, volatility: 3.0, risk: "Extreme", influence: 87, technology: 90, color: "#22c55e", accent: "#111827", note: "Diversified growth story with unusually ambitious management." },
  { ticker: "MOMC", name: "MomCorp", source: "Futurama", sector: "Consumer", exchange: "OMNI", marketCap: 2.2*T, basePrice: 470.18, floatShares: 4.68*B, volatility: 2.1, risk: "High", influence: 96, technology: 91, color: "#ec4899", accent: "#111827", note: "Robot, delivery, and consumer electronics dominance across planets." },
  { ticker: "PLNT", name: "Planet Express", source: "Futurama", sector: "Transportation", exchange: "LUNA", marketCap: 45*B, basePrice: 18.73, floatShares: 2.4*B, volatility: 4.4, risk: "Extreme", influence: 42, technology: 82, color: "#22c55e", accent: "#ef4444", note: "Tiny float, dangerous routes, inexplicably durable brand awareness." },
  { ticker: "SLRM", name: "SlurmCo", source: "Futurama", sector: "Consumer", exchange: "OMNI", marketCap: 190*B, basePrice: 51.20, floatShares: 3.71*B, volatility: 2.5, risk: "High", influence: 63, technology: 52, color: "#84cc16", accent: "#111827", note: "Beverage margins remain sticky despite gross manufacturing rumors." },
  { ticker: "VIRN", name: "Virtucon", source: "Austin Powers", sector: "Megacorp", exchange: "OMNI", marketCap: 670*B, basePrice: 160.00, floatShares: 4.19*B, volatility: 2.6, risk: "High", influence: 80, technology: 78, color: "#64748b", accent: "#111827", note: "Legitimate conglomerate optics with very theatrical executive meetings." },
  { ticker: "NKTN", name: "Nakatomi Trading", source: "Die Hard", sector: "Finance", exchange: "OMNI", marketCap: 260*B, basePrice: 76.12, floatShares: 3.42*B, volatility: 1.6, risk: "Moderate", influence: 66, technology: 61, color: "#ef4444", accent: "#111827", note: "Real estate and finance exposure with a famous security case study." },
  { ticker: "PRGN", name: "Paragon Shipping", source: "Grand Theft Auto", sector: "Transportation", exchange: "OMNI", marketCap: 140*B, basePrice: 34.50, floatShares: 4.06*B, volatility: 2.0, risk: "High", influence: 55, technology: 54, color: "#2563eb", accent: "#111827", note: "Freight volumes are solid; hijacking provisions are less solid." },
  { ticker: "LSTR", name: "Lifeinvader", source: "Grand Theft Auto", sector: "Media", exchange: "FICTDAQ", marketCap: 500*B, basePrice: 117.40, floatShares: 4.26*B, volatility: 3.5, risk: "High", influence: 83, technology: 75, color: "#3b82f6", accent: "#f8fafc", note: "Social graph assets trade at a discount to product-launch incidents." },
  { ticker: "BILK", name: "Bilkington Research", source: "Grand Theft Auto", sector: "Biotech", exchange: "FICTDAQ", marketCap: 230*B, basePrice: 68.01, floatShares: 3.38*B, volatility: 2.5, risk: "High", influence: 60, technology: 76, color: "#22c55e", accent: "#111827", note: "Healthcare innovation, aggressive accounting, memorable short interest." },
  { ticker: "MRYW", name: "Merryweather Security", source: "Grand Theft Auto", sector: "Security", exchange: "OMNI", marketCap: 410*B, basePrice: 101.22, floatShares: 4.05*B, volatility: 2.8, risk: "Extreme", influence: 76, technology: 78, color: "#64748b", accent: "#111827", note: "Private security revenue rises whenever things get worse." },
  { ticker: "FDRP", name: "Faraday Propulsion", source: "Mass Effect", sector: "Space", exchange: "LUNA", marketCap: 620*B, basePrice: 181.44, floatShares: 3.42*B, volatility: 2.1, risk: "Moderate", influence: 73, technology: 91, color: "#60a5fa", accent: "#111827", note: "Drive-core demand supports a long-cycle industrial compounder." },
  { ticker: "EXGN", name: "ExoGeni Corporation", source: "Mass Effect", sector: "Biotech", exchange: "LUNA", marketCap: 540*B, basePrice: 152.10, floatShares: 3.55*B, volatility: 2.8, risk: "High", influence: 72, technology: 90, color: "#14b8a6", accent: "#0f172a", note: "Colony science gives upside; field trials keep lawyers busy." },
  { ticker: "ELNS", name: "Elanus Risk Control", source: "Mass Effect", sector: "Security", exchange: "LUNA", marketCap: 300*B, basePrice: 88.77, floatShares: 3.38*B, volatility: 2.2, risk: "High", influence: 67, technology: 76, color: "#ef4444", accent: "#111827", note: "Mercenary services scale well until reputation risk scales faster." },
  { ticker: "RSRC", name: "Rosenkov Materials", source: "Mass Effect", sector: "Industrial", exchange: "LUNA", marketCap: 380*B, basePrice: 97.65, floatShares: 3.89*B, volatility: 1.7, risk: "Moderate", influence: 66, technology: 84, color: "#a3a3a3", accent: "#111827", note: "Materials supplier with broad armor and aerospace exposure." },
  { ticker: "MRDN", name: "Meridian Corporation", source: "Horizon", sector: "Energy", exchange: "NSE", marketCap: 290*B, basePrice: 73.50, floatShares: 3.95*B, volatility: 1.9, risk: "Moderate", influence: 62, technology: 83, color: "#f97316", accent: "#111827", note: "Machine-era infrastructure hardware with seasonal demand spikes." },
  { ticker: "FRZN", name: "Faro Automated Solutions", source: "Horizon", sector: "Artificial Intelligence", exchange: "FICTDAQ", marketCap: 1.25*T, basePrice: 399.99, floatShares: 3.13*B, volatility: 4.8, risk: "Existential", influence: 93, technology: 100, color: "#ef4444", accent: "#020617", note: "Autonomous swarm economics look fantastic until they do not." },
  { ticker: "MSSV", name: "Mossdeep Space Center", source: "Pokemon", sector: "Space", exchange: "LUNA", marketCap: 220*B, basePrice: 54.26, floatShares: 4.05*B, volatility: 1.9, risk: "Moderate", influence: 59, technology: 83, color: "#38bdf8", accent: "#111827", note: "Regional aerospace play with strong public-sector sponsorship." },
  { ticker: "DYN", name: "Dynalar Technologies", source: "Shadowrun", sector: "Cybernetics", exchange: "FICTDAQ", marketCap: 510*B, basePrice: 131.04, floatShares: 3.89*B, volatility: 2.5, risk: "High", influence: 73, technology: 88, color: "#f43f5e", accent: "#111827", note: "Implants and street-level brand recognition, for better and worse." },
  { ticker: "RENK", name: "Renraku Computer Systems", source: "Shadowrun", sector: "Artificial Intelligence", exchange: "FICTDAQ", marketCap: 1.45*T, basePrice: 344.02, floatShares: 4.22*B, volatility: 3.4, risk: "Extreme", influence: 91, technology: 96, color: "#ef4444", accent: "#111827", note: "Enterprise compute giant with a famous containment discount." },
  { ticker: "AZTC", name: "Aztechnology", source: "Shadowrun", sector: "Consumer", exchange: "OMNI", marketCap: 1.1*T, basePrice: 255.10, floatShares: 4.31*B, volatility: 2.9, risk: "Extreme", influence: 93, technology: 83, color: "#dc2626", accent: "#111827", note: "Food, magic-adjacent services, and a truly unusual ESG profile." },
  { ticker: "SAKR", name: "Saeder-Krupp", source: "Shadowrun", sector: "Megacorp", exchange: "OMNI", marketCap: 4.0*T, basePrice: 980.35, floatShares: 4.08*B, volatility: 2.2, risk: "Extreme", influence: 100, technology: 95, color: "#111827", accent: "#facc15", note: "A prime megacorp valued like a central bank with scales." },
  { ticker: "AZT", name: "Aztlan Petrochemical", source: "Shadowrun", sector: "Energy", exchange: "OMNI", marketCap: 760*B, basePrice: 180.05, floatShares: 4.22*B, volatility: 2.1, risk: "High", influence: 84, technology: 74, color: "#f97316", accent: "#111827", note: "Energy cash flows wrapped in geopolitical volatility." },
  { ticker: "MNMC", name: "Mitsuhama Computer Technologies", source: "Shadowrun", sector: "Artificial Intelligence", exchange: "FICTDAQ", marketCap: 1.6*T, basePrice: 401.40, floatShares: 3.99*B, volatility: 2.8, risk: "Extreme", influence: 90, technology: 97, color: "#3b82f6", accent: "#111827", note: "Robotics and matrix infrastructure at breathtaking scale." },
  { ticker: "HRSN", name: "Hurston Dynamics", source: "Star Citizen", sector: "Aerospace & Defense", exchange: "LUNA", marketCap: 890*B, basePrice: 221.45, floatShares: 4.02*B, volatility: 2.5, risk: "High", influence: 82, technology: 87, color: "#f59e0b", accent: "#111827", note: "Planetary industrial base with defense margins and labor overhang." },
  { ticker: "ARCC", name: "ArcCorp", source: "Star Citizen", sector: "Industrial", exchange: "LUNA", marketCap: 1.2*T, basePrice: 302.77, floatShares: 3.96*B, volatility: 2.0, risk: "High", influence: 88, technology: 89, color: "#38bdf8", accent: "#111827", note: "Urbanized-planet economics: dense, profitable, impossible to unwind." },
  { ticker: "RSI", name: "Roberts Space Industries", source: "Star Citizen", sector: "Space", exchange: "LUNA", marketCap: 1.7*T, basePrice: 455.10, floatShares: 3.74*B, volatility: 2.4, risk: "High", influence: 91, technology: 94, color: "#60a5fa", accent: "#020617", note: "Flagship spacecraft demand gives durable backlog visibility." },
  { ticker: "ANVL", name: "Anvil Aerospace", source: "Star Citizen", sector: "Aerospace & Defense", exchange: "LUNA", marketCap: 720*B, basePrice: 198.88, floatShares: 3.62*B, volatility: 2.2, risk: "High", influence: 78, technology: 90, color: "#64748b", accent: "#111827", note: "Military craft specialist with procurement-cycle torque." },
  { ticker: "MISC", name: "Musashi Industrial and Starflight Concern", source: "Star Citizen", sector: "Space", exchange: "LUNA", marketCap: 650*B, basePrice: 169.25, floatShares: 3.84*B, volatility: 1.9, risk: "Moderate", influence: 74, technology: 88, color: "#22c55e", accent: "#111827", note: "Industrial ships and cargo reliability make a practical space staple." },
  { ticker: "CZKA", name: "Czerka Corporation", source: "Star Wars", sector: "Megacorp", exchange: "OMNI", marketCap: 1.3*T, basePrice: 280.66, floatShares: 4.63*B, volatility: 2.7, risk: "Extreme", influence: 92, technology: 87, color: "#f97316", accent: "#111827", note: "Ancient conglomerate with procurement reach across messy jurisdictions." },
  { ticker: "KDYD", name: "Kuat Drive Yards", source: "Star Wars", sector: "Space", exchange: "LUNA", marketCap: 2.9*T, basePrice: 715.34, floatShares: 4.05*B, volatility: 2.0, risk: "High", influence: 97, technology: 95, color: "#94a3b8", accent: "#111827", note: "Capital ships are not a TAM; they are a political statement." },
  { ticker: "SFSY", name: "Sienar Fleet Systems", source: "Star Wars", sector: "Aerospace & Defense", exchange: "LUNA", marketCap: 1.6*T, basePrice: 390.42, floatShares: 4.1*B, volatility: 2.6, risk: "High", influence: 90, technology: 92, color: "#111827", accent: "#e5e7eb", note: "Mass fighter production with regime-transition sensitivity." },
  { ticker: "INCM", name: "Incom Corporation", source: "Star Wars", sector: "Aerospace & Defense", exchange: "LUNA", marketCap: 820*B, basePrice: 205.24, floatShares: 4.0*B, volatility: 2.3, risk: "High", influence: 82, technology: 91, color: "#f97316", accent: "#f8fafc", note: "Starfighter franchise value spiked after several heroic case studies." },
  { ticker: "CEC", name: "Concordance Extraction Corporation", source: "Dead Space", sector: "Space", exchange: "LUNA", marketCap: 1.4*T, basePrice: 321.18, floatShares: 4.36*B, volatility: 3.4, risk: "Existential", influence: 90, technology: 94, color: "#f59e0b", accent: "#111827", note: "Planet cracking economics are huge, with marker-adjacent tail risk." },
];

function fictionalMarketScale(company: FictionalCompany) {
  const civilizational = new Set(["CHOAM", "BNLG"]);
  const interstellar = new Set(["WYUT", "STK", "SAKR", "KDYD", "RDA", "SHRA"]);
  const planetary = new Set(["ARSK", "MLTC", "WNTE", "LEX", "WLLC", "ROXX", "PCHM", "MCRP", "RSI", "UAC", "CEC"]);

  if (civilizational.has(company.ticker)) return 8;
  if (interstellar.has(company.ticker)) return 5;
  if (planetary.has(company.ticker)) return 3.5;
  if (company.exchange === "LUNA" || company.sector === "Space") return 2.8;
  if (company.sector === "Megacorp" || company.influence >= 90) return 2.4;
  if (company.risk === "Existential" || company.risk === "Extreme") return 2;
  if (company.marketCap >= T) return 1.8;
  return 1.35;
}

export const fictionalCompanies: FictionalCompany[] = rawFictionalCompanies.map((company) => {
  const scale = fictionalMarketScale(company);
  return {
    ...company,
    marketCap: Math.round(company.marketCap * scale),
    floatShares: company.floatShares * scale,
  };
});

const eventTemplates = [
  "announced a procurement win that surprised desk analysts",
  "faced a regulatory probe after an incident leaked to the press",
  "raised guidance after demand outpaced even the bullish model",
  "delayed a flagship project and blamed supply chain anomalies",
  "signed a multi-world logistics contract with undisclosed terms",
  "reported a containment failure that management called immaterial",
  "launched a new product line with suspiciously perfect timing",
  "won an arbitration case tied to legacy battlefield liabilities",
  "opened a new research campus under unusually tight security",
  "cut capex while keeping moonshot R&D untouched",
];

function hashString(value: string) {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function seededNoise(seed: string, min = -1, max = 1) {
  const x = Math.sin(hashString(seed)) * 10000;
  const fraction = x - Math.floor(x);
  return min + fraction * (max - min);
}

function marketDayKey(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

export function formatFictionalMarketCap(value: number) {
  if (value >= T) return `$${(value / T).toFixed(2)}T`;
  if (value >= B) return `$${(value / B).toFixed(0)}B`;
  return `$${Math.round(value / 1_000_000).toLocaleString()}M`;
}

export function buildFictionalMarketSnapshot(date = new Date()): FictionalSnapshot[] {
  // Lightweight deterministic fallback for environments where the fictional DB
  // tables have not been seeded yet. The production update path uses
  // lib/fictional-market-engine.ts so repeated cron calls do not compound moves.
  const day = marketDayKey(date);
  const marketPulse = seededNoise(`market:${day}`, -0.9, 0.9);

  return fictionalCompanies.map((company) => {
    const companyPulse = seededNoise(`${company.ticker}:${day}`, -1, 1);
    const sectorPulse = seededNoise(`${company.sector}:${day}`, -0.55, 0.55);
    const eventPulse = seededNoise(`event:${company.ticker}:${day}`, -1.4, 1.4);
    const riskMultiplier = company.risk === "Existential" ? 1.7 : company.risk === "Extreme" ? 1.35 : company.risk === "High" ? 1.12 : 0.82;
    const changePct = Number(((marketPulse + sectorPulse + companyPulse * company.volatility + eventPulse) * riskMultiplier).toFixed(2));
    const price = Number(Math.max(0.5, company.basePrice * (1 + changePct / 100)).toFixed(2));
    const volumeBase = company.floatShares * (0.0018 + company.volatility / 1000);
    const volume = Math.round(volumeBase * (1 + Math.abs(changePct) / 18 + seededNoise(`volume:${company.ticker}:${day}`, -0.18, 0.22)));
    const peRatio = company.sector === "Finance" || company.risk === "Existential"
      ? null
      : Number((18 + company.technology / 6 + seededNoise(`pe:${company.ticker}:${day}`, -4, 5)).toFixed(1));
    const dividendYield = company.sector === "Energy" || company.sector === "Finance" || company.sector === "Industrial"
      ? Number(Math.max(0, seededNoise(`yield:${company.ticker}:${day}`, 0.2, 3.6)).toFixed(2))
      : null;
    const templateIndex = Math.abs(hashString(`news:${company.ticker}:${day}`)) % eventTemplates.length;
    const sparkline = Array.from({ length: 28 }, (_, point) => {
      const drift = (point - 14) * changePct * 0.003;
      const wiggle = seededNoise(`spark:${company.ticker}:${day}:${point}`, -company.volatility, company.volatility);
      return Number(Math.max(0.5, company.basePrice * (1 + (drift + wiggle) / 100)).toFixed(2));
    });

    return {
      ...company,
      price,
      changePct,
      volume,
      peRatio,
      dividendYield,
      news: `${company.name} ${eventTemplates[templateIndex]}.`,
      sparkline,
    };
  }).sort((a, b) => b.marketCap - a.marketCap || a.ticker.localeCompare(b.ticker));
}

export function buildFictionalMarketEvents(date = new Date(), limit = 12): FictionalMarketEvent[] {
  const snapshot = buildFictionalMarketSnapshot(date);
  return snapshot
    .map((company) => ({
      ticker: company.ticker,
      headline: company.news,
      impactPct: company.changePct,
      severity: Math.abs(company.changePct) >= 7 ? "chaotic" : Math.abs(company.changePct) >= 3.5 ? "material" : "routine",
    } satisfies FictionalMarketEvent))
    .sort((a, b) => Math.abs(b.impactPct) - Math.abs(a.impactPct))
    .slice(0, limit);
}
