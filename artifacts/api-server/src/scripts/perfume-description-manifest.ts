// The Word headings are source anchors, not translated product names. A SKU is
// required in addition to the slug and Arabic name before any row can change.
export const perfumeDescriptionSource = {
  file: "attached_assets/Perfumes_description_1790257818157.docx",
  entries: [
    { headingEn: "ROYAL OUD", headingAr: "رويال عود", id: 6, slug: "royal-oud", nameAr: "رويال عود", sku: "6287020840029" },
    { headingEn: "ROYAL  MUSK", headingAr: "رويال مسك", id: 5, slug: "royal-musk", nameAr: "رويال مسك", sku: "6287020840012" },
    { headingEn: "ROYAL  JASMINE", headingAr: "رويال جازمين", id: 4, slug: "royal-jasmine", nameAr: "رويال جازمين", sku: "6287020840036" },
    { headingEn: "Royal Collection", headingAr: "المجموعة الملكية", id: null, slug: null, nameAr: "المجموعة الملكية", sku: null },
    { headingEn: "LADY  LULU", headingAr: "ليدي لولو", id: 3, slug: "lady-lulu", nameAr: "ليدي لولو", sku: "6287020840050" },
    { headingEn: "EVORA", headingAr: "إيفورا", id: 2, slug: "evora", nameAr: "ايفورا", sku: "6287020840074" },
    { headingEn: "SOLENN", headingAr: "سولين", id: 1, slug: "solenn", nameAr: "سولين", sku: "6287020840067" },
    { headingEn: "LUNÉRA – Hair Mist", headingAr: "لونيرا – عطر شعر", id: 8, slug: "lunera", nameAr: "لونيرا", sku: "6287020840081" },
    { headingEn: "LUMISK – Hair Mist", headingAr: "لومسك -عطر شعر", id: 9, slug: "lumisk", nameAr: "لومسك", sku: "6287020840098" },
    // The source calls it Peach Muse, but the existing SKU identifies Beach Moss.
    { headingEn: "PEACH MUSE – Hair Mist", headingAr: "بيتش موس – عطر الشعر", id: 7, slug: "beach-moss", nameAr: "بيتش موس", sku: "6287020840104" },
  ],
} as const;