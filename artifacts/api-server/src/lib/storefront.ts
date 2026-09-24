import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import {
  addressesTable,
  adminUsersTable,
  cartItemsTable,
  cartsTable,
  categoriesTable,
  couponsTable,
  customersTable,
  db,
  inventoryMovementsTable,
  orderAddressesTable,
  orderItemsTable,
  ordersTable,
  otpRecordsTable,
  productsTable,
  influencersTable,
  influencerCouponsTable,
  orderAttributionsTable,
  shipmentsTable,
} from "@workspace/db";
import { ensureAdminSeeded } from "./admin-auth";
import { postFulfillmentCogs, updateOrderAndIssueInvoice } from "./invoices";
import { adjustOperationalBalances } from "./operations";
import { ensureStandardAccountingChart } from "./accounting";
import { nextIndividualOrderNumber } from "./order-numbers";
import { extractVatFromGross } from "./vat";

type ProductSeed = {
  id: number;
  nameAr: string;
  nameEn: string;
  slug: string;
  price: number;
  compareAtPrice: number | null;
  categorySlug: string;
  categoryNameAr: string;
  imageUrl: string;
  hoverImageUrl: string | null;
  isFeatured: boolean;
  isBestseller: boolean;
  stock: number;
  descriptionAr: string;
  descriptionEn: string;
  images: string[];
  notes: Array<{ type: "top" | "heart" | "base"; nameAr: string; nameEn: string }>;
};

const categorySeeds = [
  {
    id: 1,
    nameAr: "عطور",
    nameEn: "Perfumes",
    slug: "perfumes",
    imageUrl: "/api/site-assets/Z4GiN6OWeqiNXcuKcHQ85XOrAN3ryV0ZDSw2AlWT-3ddbaf2269.jpg",
  },
  {
    id: 2,
    nameAr: "عطور شعر",
    nameEn: "Hair Perfumes",
    slug: "hair-mists",
    imageUrl: "/api/site-assets/jR6vS9rQpvlG7Ae5GlqQVu607nQiRLW63xYK2jBM-a9ba37f4bd.jpg",
  },
];

const productSeeds: ProductSeed[] = [
  {
    id: 1,
    nameAr: "سولين",
    nameEn: "Solenn",
    slug: "solenn",
    price: 398,
    compareAtPrice: null,
    categorySlug: "perfumes",
    categoryNameAr: "عطور",
    imageUrl: "/api/site-assets/Z4GiN6OWeqiNXcuKcHQ85XOrAN3ryV0ZDSw2AlWT-3ddbaf2269.jpg",
    hoverImageUrl: "/api/site-assets/89736919-a9d1-4f9d-9602-5abbec8d9737-1000x1000-Z4GiN6OWeqiNXcuKcHQ85XO-61ca28c0f2.jpg",
    isFeatured: true,
    isBestseller: true,
    stock: 100,
    descriptionAr:
      ".ليس عطرًا… بل أسطورة تُهمس، لا تُقال\n.سولين هو سكون مهيب ينبض بالفخامة… يلامسك دون أن يطلب الإذن، ويتسلل كقصيدة خالدة تُروى في اللحظة\n.تفتتحه القرفة الدافئة ممزوجة بلمحات البرتقال الغني، تتداخل معها الشوكولاتة الداكنة والبخور، في طقوس افتتاحية تبعث الهيبة والدهشة معًا\n.وفي القلب، يهمس المُرّ بنعومة، محاطًا بالجلد والفانيليا، كأنك تغوص في نسيج مخملي من الغموض والترف\n.ثم تنساب القاعدة بثباتٍ ساحر من التونكا الحلوة، خشب الصندل، والعنبر… ختام لا يليق إلا بالعظماء\n.سولين... ليس توقيعًا عطريًا فحسب، بل هالة من الوقار تختار من يليق بها. هو الفخامة إذا قررت أن تتجسّد في عبير\nإكستريت دو بارفام: 50 مل\nرقم الإدراج: CN-2025-136985",
    descriptionEn: "",
    images: [
      "/api/site-assets/Z4GiN6OWeqiNXcuKcHQ85XOrAN3ryV0ZDSw2AlWT-3ddbaf2269.jpg",
      "/api/site-assets/89736919-a9d1-4f9d-9602-5abbec8d9737-1000x1000-Z4GiN6OWeqiNXcuKcHQ85XO-61ca28c0f2.jpg",
    ],
    notes: [
      { type: "top", nameAr: "قرفة، برتقال، شوكولاتة، بخور", nameEn: "Cinnamon, orange, chocolate, incense" },
      { type: "heart", nameAr: "مُرّ، جلد، فانيليا", nameEn: "Myrrh, leather, vanilla" },
      { type: "base", nameAr: "تونكا، خشب الصندل، عنبر", nameEn: "Tonka, sandalwood, amber" },
    ],
  },
  {
    id: 2,
    nameAr: "ايفورا",
    nameEn: "Evora",
    slug: "evora",
    price: 388,
    compareAtPrice: null,
    categorySlug: "perfumes",
    categoryNameAr: "عطور",
    imageUrl: "/api/site-assets/GQucHgimnMoZJq4BzeZsB8mbH2UOuLMw8yPNwJ7L-96b8497a43.jpg",
    hoverImageUrl: "/api/site-assets/f2ba4735-9347-41d8-9bcf-fe24157ba159-1000x1000-GQucHgimnMoZJq4BzeZsB8m-b8193c5ce1.jpg",
    isFeatured: false,
    isBestseller: false,
    stock: 100,
    descriptionAr:
      "سحر الجاذبية والتألق.\nيبدأ إيفورا نفحاته بجوز الهند الغني، تتناغم بسلاسة مع لمسات فاكهية نابضة من الليتشي والبرقوق.\nفي القلب، تمتزج الفانيلا الناعمة مع الياسمين والخوخ، لتتوجها قاعدة دافئة من التونكا والمسك والعنبر، تاركة بصمة لا تُنسى.\nكل تفصيل في إيفورا يعكس الفخامة، مع تصميم يحتضن حبيبات اللؤلؤ التي تجسد النقاء والجمال الراقي، ليتفرد بتوقيع عطري يروي حكاية الأناقة والجاذبية في كل لحظة.\nبارفام: 50 مل\nرقم الإدراج: CN-2025-136999",
    descriptionEn: "",
    images: [
      "/api/site-assets/GQucHgimnMoZJq4BzeZsB8mbH2UOuLMw8yPNwJ7L-96b8497a43.jpg",
      "/api/site-assets/f2ba4735-9347-41d8-9bcf-fe24157ba159-1000x1000-GQucHgimnMoZJq4BzeZsB8m-b8193c5ce1.jpg",
    ],
    notes: [
      { type: "top", nameAr: "جوز الهند، الليتشي، البرقوق", nameEn: "Coconut, lychee, plum" },
      { type: "heart", nameAr: "الفانيلا، الياسمين، الخوخ", nameEn: "Vanilla, jasmine, peach" },
      { type: "base", nameAr: "التونكا، المسك، العنبر", nameEn: "Tonka, musk, amber" },
    ],
  },
  {
    id: 3,
    nameAr: "ليدي لولو",
    nameEn: "Lady Lulu",
    slug: "lady-lulu",
    price: 388,
    compareAtPrice: null,
    categorySlug: "perfumes",
    categoryNameAr: "عطور",
    imageUrl: "/api/site-assets/ZsRQ5MzAi27fv6gd0OKXfXvcsJwsR4krjsb1riQW-1ff2343f7f.jpg",
    hoverImageUrl: "/api/site-assets/25334ee0-3d39-41de-aa7c-707933daecea-1000x1000-ZsRQ5MzAi27fv6gd0OKXfXv-c540d2ef86.jpg",
    isFeatured: false,
    isBestseller: false,
    stock: 100,
    descriptionAr:
      ".دلالكِ… بصيغة عطر\n.كل شيء يبدأ بلحظة خفيفة؛ كمثرى ناعمة تلتقي ببندق محمّص، تمتزج مع خيوط بخور هادئة تهمس في الأجواء وتثير فضولاً لا إجابة له\n.ثم يتفتح القلب بعذوبة، حيث تذوب الفانيليا الكريمية في جوز الهند وتنساب فوقها زهور الورد والياسمين، تتراقص على إيقاع أنوثة لا تصرخ، لكنها تُقال\n.وفي العمق، يستقر العطر على قاعدة ناعمة من خشب الصندل والمسك والعنبر، تلفّ اللحظة بهدوء فخم وتترك لمسة لا تُنسى\n.ليدي لولو... لمن تعرف كيف تمرّ بخفة، وتبقى في الذاكرة\nإكستريت دو بارفام: 50 مل\nرقم الإدراج: CN-2025-136974",
    descriptionEn: "",
    images: [
      "/api/site-assets/ZsRQ5MzAi27fv6gd0OKXfXvcsJwsR4krjsb1riQW-1ff2343f7f.jpg",
      "/api/site-assets/25334ee0-3d39-41de-aa7c-707933daecea-1000x1000-ZsRQ5MzAi27fv6gd0OKXfXv-c540d2ef86.jpg",
    ],
    notes: [
      { type: "top", nameAr: "كمثرى، بندق، بخور", nameEn: "Pear, hazelnut, incense" },
      { type: "heart", nameAr: "فانيليا، جوز الهند، ورد، ياسمين", nameEn: "Vanilla, coconut, rose, jasmine" },
      { type: "base", nameAr: "خشب الصندل، مسك، عنبر", nameEn: "Sandalwood, musk, amber" },
    ],
  },
  {
    id: 4,
    nameAr: "رويال جازمين",
    nameEn: "Royal Jasmine",
    slug: "royal-jasmine",
    price: 368,
    compareAtPrice: null,
    categorySlug: "perfumes",
    categoryNameAr: "عطور",
    imageUrl: "/api/site-assets/JUgwHxHhDBw4B4sCZ8nXml1rQrqOB7ZbyG5vLMa9-b4ca679350.jpg",
    hoverImageUrl: "/api/site-assets/f4339eb5-d639-4155-b3db-189ec9383ec7-1000x1000-JUgwHxHhDBw4B4sCZ8nXml1-d133407be3.jpg",
    isFeatured: true,
    isBestseller: true,
    stock: 100,
    descriptionAr:
      "عطر يفيض بإشراقة الأزهار الملكية.\nيتألق رويال جازمين بتناغم آسر بين البرغموت وزهرة الماندرين والورد، ممهدًا الطريق لقلبٍ مشرق من الياسمين الملكي والمسك.\nتختتم القاعدة بنفحات ناعمة من المسك وطحلب السنديان والعنبر، تترك بصمة أنيقة تدوم.\nيأتي العطر بتصميم راقٍ يحتضن حبيبات اللؤلؤ، ليكون توقيعًا عطريًا يفيض بالرومانسية والدفء، ويعيد إحياء أجمل الذكريات مع كل نفحة.\nرويال جازمين... أناقة تزهر في سكون.\nإكستريت دو بارفام: 50مل\nرقم الإدراج: CN-2025-136960",
    descriptionEn: "",
    images: [
      "/api/site-assets/JUgwHxHhDBw4B4sCZ8nXml1rQrqOB7ZbyG5vLMa9-b4ca679350.jpg",
      "/api/site-assets/f4339eb5-d639-4155-b3db-189ec9383ec7-1000x1000-JUgwHxHhDBw4B4sCZ8nXml1-d133407be3.jpg",
    ],
    notes: [
      { type: "top", nameAr: "برغموت، زهرة الماندرين، ورد", nameEn: "Bergamot, mandarin blossom, rose" },
      { type: "heart", nameAr: "مسك، ياسمين", nameEn: "Musk, jasmine" },
      { type: "base", nameAr: "مسك، طحلب السنديان، عنبر", nameEn: "Musk, oakmoss, amber" },
    ],
  },
  {
    id: 5,
    nameAr: "رويال مسك",
    nameEn: "Royal Musk",
    slug: "royal-musk",
    price: 338,
    compareAtPrice: null,
    categorySlug: "perfumes",
    categoryNameAr: "عطور",
    imageUrl: "/api/site-assets/6qwNwOYORbip0xPUFAvwppnVs8d7RfmPQIW5VLJA-bcfdada348.jpg",
    hoverImageUrl: "/api/site-assets/060211f3-140d-447c-bb11-78f860fd991a-1000x1000-6qwNwOYORbip0xPUFAvwppn-db8e381e8e.jpg",
    isFeatured: true,
    isBestseller: true,
    stock: 100,
    descriptionAr:
      "هدوءٌ مختلف... يُترجم الفخامة بطريقته.\nينساب رويال مسك كنسمةٍ راقيةٍ من الصفاء، تبدأ بلمسات ليمونٍ خفيفةٍ تُنعش الحواس برفق، ثم يتفتح قلبه بتناغمٍ فريدٍ بين الورد الجوري والياسمين، في مزيجٍ يعبّر عن رُقيٍّ لا يُقال... بل يُحسّ.\nوفي القاعدة، يحتضن المسك والفانيلا وخشب الصندل سكونًا دافئًا يُجسّد الجاذبية ببساطتها، والفخامة في هدوئها.\nعطرٌ يحمل بصمةً مختلفة، تُشبه الأناقة حين تُلهم... لا حين تتحدث.\n.رويال مسك... فخامة السكون وجاذبية الهدوء\nإكستريت دو بارفام: 50مل\nرقم الإدراج: CN-2025-136925",
    descriptionEn: "",
    images: [
      "/api/site-assets/6qwNwOYORbip0xPUFAvwppnVs8d7RfmPQIW5VLJA-bcfdada348.jpg",
      "/api/site-assets/060211f3-140d-447c-bb11-78f860fd991a-1000x1000-6qwNwOYORbip0xPUFAvwppn-db8e381e8e.jpg",
    ],
    notes: [
      { type: "top", nameAr: "ليمون", nameEn: "Lemon" },
      { type: "heart", nameAr: "القرنفل، ورد جوري دمشقي، ياسمين، باودر", nameEn: "Clove, Damask rose, jasmine, powder" },
      { type: "base", nameAr: "خشب الصندل، خشب الأرز، المسك، فانيلا", nameEn: "Sandalwood, cedarwood, musk, vanilla" },
    ],
  },
  {
    id: 6,
    nameAr: "رويال عود",
    nameEn: "Royal Oud",
    slug: "royal-oud",
    price: 468,
    compareAtPrice: null,
    categorySlug: "perfumes",
    categoryNameAr: "عطور",
    imageUrl: "/api/site-assets/gHznuvp0av4HBzCmUF65gm4oBXJWCOkvGQYRWoWX-4552dd4f5a.jpg",
    hoverImageUrl: "/api/site-assets/d71c537f-b435-422e-8913-51b65fed1eef-1000x1000-gHznuvp0av4HBzCmUF65gm4-50c7dba686.jpg",
    isFeatured: true,
    isBestseller: false,
    stock: 100,
    descriptionAr:
      "عطر يتجاوز التوقّع… ولا يُشبه إلا النخبة.\nفي كل رشة، ينساب الزعفران النقي ونفحات الماندرين المترفة، ليفتتح حضورًا ملكياً آسراً.\nيتوسطه عبق البخور المهيب، يلتفّ حوله الورد الفاخر بلمسة من الغموض.\nأما القاعدة، فهي وعدٌ بالثبات والأناقة… فانيليا ناعمة، مِسك أبيض، عنبر دافئ، وخشب الصندل يخلّد العطر على الجلد كوشمٍ من الفخامة.\nرويال عود.… ليس مجرد عطر... بل هالة تُروى، وهيبة تُحسّ، ورفاهية تُرتدى\nبارفام: 50 مل\nرقم الإدراج: CN-2025-136946",
    descriptionEn: "",
    images: [
      "/api/site-assets/gHznuvp0av4HBzCmUF65gm4oBXJWCOkvGQYRWoWX-4552dd4f5a.jpg",
      "/api/site-assets/d71c537f-b435-422e-8913-51b65fed1eef-1000x1000-gHznuvp0av4HBzCmUF65gm4-50c7dba686.jpg",
    ],
    notes: [
      { type: "top", nameAr: "ماندرين، زعفران", nameEn: "Mandarin, saffron" },
      { type: "heart", nameAr: "بخور، ورد", nameEn: "Incense, rose" },
      { type: "base", nameAr: "فانيليا، مسك، عنبر، خشب الصندل", nameEn: "Vanilla, musk, amber, sandalwood" },
    ],
  },
  {
    id: 7,
    nameAr: "بيتش موس",
    nameEn: "Beach Moss",
    slug: "beach-moss",
    price: 208,
    compareAtPrice: null,
    categorySlug: "hair-mists",
    categoryNameAr: "عطور شعر",
    imageUrl: "/api/site-assets/jR6vS9rQpvlG7Ae5GlqQVu607nQiRLW63xYK2jBM-a9ba37f4bd.jpg",
    hoverImageUrl: "/api/site-assets/98801387-383b-4b0a-8ca8-52f4e63a7a87-1000x1000-jR6vS9rQpvlG7Ae5GlqQVu6-fc0139429f.jpg",
    isFeatured: false,
    isBestseller: false,
    stock: 100,
    descriptionAr:
      ".لحظة نقية… وأثر ساحر\n.يبدأ العطر بنفحات خوخ ناعمة وبرغموت منعش، تتسلل بخفة إلى خصلاتك وتمنحها لمعانًا رقيقًا كأنها خرجت للتو من لحظة صفاء\n.ثم تمتزج لمسات جوز الهند بإحساسٍ من النقاء والانتعاش المتجدد، قبل أن تنسدل زهور الورد والياسمين بهدوء، تغمر الشعر بهالة ناعمة لا تُنسى\n.وفي القاعدة، تلتف نفحات المسك ونجيل الهند كأثر حريري يلامس من حولك دون إعلان\n.وتم تعزيز العطر بعناصر عناية شعرية خفيفة تمنح الخصلات ترطيبًا حريريًا ولمعانًا طبيعيًا، لتبقى كل خصلة ناعمة، منسابة، ومفعمة بالحيوية… دون أي ثِقل\n.بيتش موس… للأنثى التي لا تبحث عن التأثير، بل تخلقه\nعطر شعر: 35 مل\nرقم الإدراج: CN-2025-136915",
    descriptionEn: "",
    images: [
      "/api/site-assets/jR6vS9rQpvlG7Ae5GlqQVu607nQiRLW63xYK2jBM-a9ba37f4bd.jpg",
      "/api/site-assets/98801387-383b-4b0a-8ca8-52f4e63a7a87-1000x1000-jR6vS9rQpvlG7Ae5GlqQVu6-fc0139429f.jpg",
    ],
    notes: [
      { type: "top", nameAr: "برغموت، خوخ، جوز الهند", nameEn: "Bergamot, peach, coconut" },
      { type: "heart", nameAr: "ياسمين، ورد، باتشولي", nameEn: "Jasmine, rose, patchouli" },
      { type: "base", nameAr: "مسك، نجيل الهند", nameEn: "Musk, vetiver" },
    ],
  },
  {
    id: 8,
    nameAr: "لونيرا",
    nameEn: "Lunera",
    slug: "lunera",
    price: 208,
    compareAtPrice: null,
    categorySlug: "hair-mists",
    categoryNameAr: "عطور شعر",
    imageUrl: "/api/site-assets/tfvLAVTWmBIAh3HMVA8jReY0lr3C8Ki6C2Ht5i4b-c1cc11b9d3.jpg",
    hoverImageUrl: "/api/site-assets/0b95ee75-cff8-4900-a2d1-bce639e6c3ab-1000x1000-tfvLAVTWmBIAh3HMVA8jReY-08bbf96730.jpg",
    isFeatured: true,
    isBestseller: true,
    stock: 100,
    descriptionAr:
      "لا يُرى… لكنه يُحسّ، يُلهم، ويُبقي خلفه حكاية.\nتبدأ أولى نفحاته برفرفة من الزعفران والتوت الأحمر والفلفل الأسود، تنساب برقيّ وتوقظ الحواس دون جهد.\nثم يكشف القلب عن وردٍ مخملي ترافقه لمسات بخور وتبغ دافئ تمنح الشعر حضورًا آسِرًا.\nوفي القاعدة، تتجسد الفخامة الصامتة: مِسك أبيض، خشب الصندل، طحلب البلوط، ولمسات عنبر تلفّ الخصلات كوشاح من الهدوء العميق.\nيدمج العطر عناصر عناية ذات تركيبات حريرية ناعمة تمنح الشعر ترطيبًا خفيفًا، لمعانًا رقيقًا، وتترك خصلاتك تنساب بكل سلاسة دون ثِقل، لتبقى اللمسة… أثرًا لا يُقال، بل يُحسّ.\nلونيرا… لأن الشعر لا يحتاج صوتًا ليُعبّر، يكفيه أن يتنفس فخامة.\nعطر شعر: 35 مل\nرقم الادراج: CN-2025-136724",
    descriptionEn: "",
    images: [
      "/api/site-assets/tfvLAVTWmBIAh3HMVA8jReY0lr3C8Ki6C2Ht5i4b-c1cc11b9d3.jpg",
      "/api/site-assets/0b95ee75-cff8-4900-a2d1-bce639e6c3ab-1000x1000-tfvLAVTWmBIAh3HMVA8jReY-08bbf96730.jpg",
    ],
    notes: [
      { type: "top", nameAr: "زعفران، توت أحمر، الفلفل الأسود", nameEn: "Saffron, red berries, black pepper" },
      { type: "heart", nameAr: "ورد، بخور، تبغ", nameEn: "Rose, incense, tobacco" },
      { type: "base", nameAr: "مسك، خشب الصندل، طحلب البلوط، عنبر الحوت", nameEn: "Musk, sandalwood, oakmoss, ambergris" },
    ],
  },
  {
    id: 9,
    nameAr: "لومسك",
    nameEn: "Lumisk",
    slug: "lumisk",
    price: 208,
    compareAtPrice: null,
    categorySlug: "hair-mists",
    categoryNameAr: "عطور شعر",
    imageUrl: "/api/site-assets/ny6PK87lD7XY6O1qwF1NASOWOXd0PlGjxbjqX0mD-da2cefee0a.jpg",
    hoverImageUrl: "/api/site-assets/a49557f8-9d8a-4318-99c7-54db0680020e-1000x1000-ny6PK87lD7XY6O1qwF1NASO-ccee4a6fbd.jpg",
    isFeatured: false,
    isBestseller: false,
    stock: 100,
    descriptionAr:
      "ضوء ناعم... يهمس بالمسك.\nعطرٌ يفيض بأنوثةٍ هادئةٍ تجذب دون أن تحاول، يجدها الضوء قبل أن تبحث عنه.\nتبدأ نفحاته بإشراقة ليمونٍ خفيفة تمنح الشعر لمعانًا رقيقًا، ثم يتفتح القلب بورودٍ دمشقية وياسمينٍ كنسمة فجرٍ دافئة، تتداخل مع باودر ناعم يضيف عمقًا من السكون والرقة.\nوفي القاعدة، يحتضن الصندل والفانيلا والمسك الخصلات بهدوءٍ فخم، مع لمسات عناية مرطّبة وخفيفة تمنح الشعر انسيابية حريرية ولمعانًا طبيعيًا دون أن تثقله، ليترك حضورًا ناعمًا يُحسّ… قبل أن يُرى.\nلومسك... لأن الهدوء يخلق الحضور.\nعطر شعر: 35 مل\nرقم الادراج: CN-2025-136459",
    descriptionEn: "",
    images: [
      "/api/site-assets/ny6PK87lD7XY6O1qwF1NASOWOXd0PlGjxbjqX0mD-da2cefee0a.jpg",
      "/api/site-assets/a49557f8-9d8a-4318-99c7-54db0680020e-1000x1000-ny6PK87lD7XY6O1qwF1NASO-ccee4a6fbd.jpg",
    ],
    notes: [
      { type: "top", nameAr: "ليمون", nameEn: "Lemon" },
      { type: "heart", nameAr: "القرنفل، ورد جوري دمشقي، ياسمين، باودر", nameEn: "Clove, Damask rose, jasmine, powder" },
      { type: "base", nameAr: "خشب الصندل، خشب الأرز، المسك، فانيلا", nameEn: "Sandalwood, cedarwood, musk, vanilla" },
    ],
  },
];

export function toProduct(product: ProductSeed) {
  const {
    descriptionAr: _descriptionAr,
    descriptionEn: _descriptionEn,
    images: _images,
    notes: _notes,
    ...summary
  } = product;
  return summary;
}

let catalogSeedPromise: Promise<void> | null = null;

async function seedCatalog() {
  await db
    .insert(categoriesTable)
    .values(categorySeeds.map(({ id, nameAr, nameEn, slug }) => ({
      id,
      nameAr,
      nameEn,
      slug,
    })))
    .onConflictDoNothing({ target: categoriesTable.slug });

  const categoryRows = await db.select().from(categoriesTable);
  const categoryIds = new Map(categoryRows.map((category) => [category.slug, category.id]));

  await db
    .insert(productsTable)
    .values(productSeeds.map((product) => ({
      id: product.id,
      nameAr: product.nameAr,
      nameEn: product.nameEn,
      descriptionAr: product.descriptionAr,
      descriptionEn: product.descriptionEn,
      slug: product.slug,
      price: product.price,
      compareAtPrice: product.compareAtPrice,
      categoryId: categoryIds.get(product.categorySlug)!,
      images: product.images.map((url, index) => ({
        url,
        alt: index === 0 ? product.nameAr : `${product.nameAr} ${index + 1}`,
      })),
      notes: product.notes,
      stockQuantity: product.stock,
      isActive: true,
      isFeatured: product.isFeatured,
      isBestseller: product.isBestseller,
    })))
    .onConflictDoNothing({ target: productsTable.slug });

  await db
    .insert(couponsTable)
    .values({
      code: "ELLOLO10",
      discountType: "percentage",
      discountValue: 10,
      usageLimit: null,
      expiresAt: null,
      isActive: true,
    })
    .onConflictDoNothing({ target: couponsTable.code });
}

async function ensureCatalogSeeded() {
  catalogSeedPromise ??= seedCatalog().catch((error) => {
    catalogSeedPromise = null;
    throw error;
  });
  await catalogSeedPromise;
}

function mapDatabaseProduct(
  product: typeof productsTable.$inferSelect,
  category: typeof categoriesTable.$inferSelect,
): ProductSeed {
  const imageUrls = product.images.map(({ url }) => url);
  return {
    id: product.id,
    nameAr: product.nameAr,
    nameEn: product.nameEn,
    slug: product.slug,
    price: product.price,
    compareAtPrice: product.compareAtPrice,
    categorySlug: category.slug,
    categoryNameAr: category.nameAr,
    imageUrl: imageUrls[0] ?? "",
    hoverImageUrl: imageUrls[1] ?? null,
    isFeatured: product.isFeatured,
    isBestseller: product.isBestseller,
    stock: product.stockQuantity,
    descriptionAr: product.descriptionAr,
    descriptionEn: product.descriptionEn,
    images: imageUrls,
    notes: product.notes,
  };
}

export async function listCatalogProducts() {
  await ensureCatalogSeeded();
  const rows = await db
    .select({ product: productsTable, category: categoriesTable })
    .from(productsTable)
    .innerJoin(categoriesTable, eq(productsTable.categoryId, categoriesTable.id))
    .where(and(eq(productsTable.isActive, true), eq(productsTable.sellable, true), eq(categoriesTable.isActive, true)))
    .orderBy(productsTable.id);
  return rows.map(({ product, category }) => mapDatabaseProduct(product, category));
}

export async function listCatalogCategories() {
  await ensureCatalogSeeded();
  const [categoryRows, productRows] = await Promise.all([
    db.select().from(categoriesTable).where(eq(categoriesTable.isActive, true)).orderBy(categoriesTable.id),
    db.select().from(productsTable).where(and(eq(productsTable.isActive, true), eq(productsTable.sellable, true))).orderBy(productsTable.id),
  ]);
  return categoryRows.map((category) => {
    const firstProduct = productRows.find((product) => product.categoryId === category.id);
    return {
      id: category.id,
      nameAr: category.nameAr,
      nameEn: category.nameEn,
      slug: category.slug,
      imageUrl: firstProduct?.images[0]?.url ?? "",
    };
  });
}

export async function getCatalogProductBySlug(slug: string) {
  return (await listCatalogProducts()).find((product) => product.slug === slug) ?? null;
}

async function getCatalogProductById(id: number) {
  return (await listCatalogProducts()).find((product) => product.id === id) ?? null;
}

export type CustomerRecord = {
  id: number;
  phone: string;
  name: string;
  email: string | null;
  phoneVerified: boolean;
};

type AddressRecord = {
  id: number;
  userId: number;
  label: string;
  city: string;
  district: string;
  street: string;
  buildingNo: string;
  additionalInfo: string | null;
  isDefault: boolean;
};

type OrderRecord = {
  id: number;
  userId: number;
  orderNumber: string;
  subtotal: number;
  shippingCost: number;
  discount: number;
  tax: number;
  total: number;
  status: "new" | "processing" | "shipped" | "delivered" | "cancelled";
  paymentStatus: "pending" | "paid" | "failed" | "refunded";
  trackingNumber: string | null;
  items: Array<{ productName: string; quantity: number; unitPrice: number; totalPrice: number; imageUrl: string | null }>;
  createdAt: string;
};

const tokenSecret = process.env.SESSION_SECRET ?? "musk-ellolo-development-session-secret";

function sign(value: string) {
  return createHmac("sha256", tokenSecret).update(value).digest("base64url");
}

export function issueToken(userId: number) {
  const payload = `${userId}.${Date.now() + 1000 * 60 * 60 * 24 * 30}`;
  return `${payload}.${sign(payload)}`;
}

export async function getUserFromToken(rawToken: string | undefined): Promise<CustomerRecord | null> {
  if (!rawToken) return null;
  const [userId, expiry, signature] = rawToken.split(".");
  if (!userId || !expiry || !signature || Number(expiry) < Date.now()) return null;
  const payload = `${userId}.${expiry}`;
  const expected = sign(payload);
  if (expected.length !== signature.length) return null;
  if (!timingSafeEqual(Buffer.from(expected), Buffer.from(signature))) return null;

  const [user] = await db
    .select({
      id: customersTable.id,
      phone: customersTable.phone,
      name: customersTable.name,
      email: customersTable.email,
      phoneVerified: customersTable.phoneVerified,
    })
    .from(customersTable)
    .where(eq(customersTable.id, Number(userId)))
    .limit(1);
  return user ?? null;
}

export async function requestDevelopmentOtp(phone: string) {
  const code = "123456";
  await db
    .insert(otpRecordsTable)
    .values({ phone, code, expiresAt: new Date(Date.now() + 1000 * 60 * 5) })
    .onConflictDoUpdate({
      target: otpRecordsTable.phone,
      set: { code, expiresAt: new Date(Date.now() + 1000 * 60 * 5), createdAt: new Date() },
    });
  return code;
}

export async function verifyDevelopmentOtp(phone: string, code: string, guestToken?: string): Promise<CustomerRecord | null> {
  return db.transaction(async (tx) => {
    const [record] = await tx
      .delete(otpRecordsTable)
      .where(and(eq(otpRecordsTable.phone, phone), eq(otpRecordsTable.code, code), sql`${otpRecordsTable.expiresAt} > now()`))
      .returning();
    if (!record) return null;
    const [user] = await tx
      .insert(customersTable)
      .values({ phone, name: "عميل مسك اللولو", email: null, phoneVerified: true })
      .onConflictDoUpdate({ target: customersTable.phone, set: { phoneVerified: true, updatedAt: new Date() } })
      .returning({
        id: customersTable.id,
        phone: customersTable.phone,
        name: customersTable.name,
        email: customersTable.email,
        phoneVerified: customersTable.phoneVerified,
      });
    if (guestToken) {
      const [guestCart] = await tx.select().from(cartsTable).where(eq(cartsTable.guestToken, guestToken)).limit(1);
      if (guestCart) {
        await tx.execute(sql`select id from ${cartsTable} where id = ${guestCart.id} for update`);
        const [userCart] = await tx.insert(cartsTable).values({ userId: user.id })
          .onConflictDoUpdate({ target: cartsTable.userId, set: { updatedAt: new Date() } }).returning();
        const guestItems = await tx.select().from(cartItemsTable).where(eq(cartItemsTable.cartId, guestCart.id));
        for (const item of guestItems) {
          const [product] = await tx
            .select({ stock: productsTable.stockQuantity })
            .from(productsTable)
            .where(and(eq(productsTable.id, item.productId), eq(productsTable.isActive, true), eq(productsTable.sellable, true)))
            .limit(1);
          const stock = product?.stock;
          if (!stock) continue;
          await tx.insert(cartItemsTable).values({ cartId: userCart.id, productId: item.productId, quantity: item.quantity })
            .onConflictDoUpdate({
              target: [cartItemsTable.cartId, cartItemsTable.productId],
              set: { quantity: sql`least(${cartItemsTable.quantity} + ${item.quantity}, ${stock})`, updatedAt: new Date() },
            });
        }
        await tx.delete(cartsTable).where(eq(cartsTable.id, guestCart.id));
      }
    }
    return user;
  });
}

export type CartOwner = { userId: number } | { guestToken: string };

function ownerWhere(owner: CartOwner) {
  return "userId" in owner ? eq(cartsTable.userId, owner.userId) : eq(cartsTable.guestToken, owner.guestToken);
}

async function ensureCart(owner: CartOwner) {
  const [cart] = await db
    .insert(cartsTable)
    .values(owner)
    .onConflictDoUpdate({
      target: "userId" in owner ? cartsTable.userId : cartsTable.guestToken,
      set: { updatedAt: new Date() },
    })
    .returning({ id: cartsTable.id, userId: cartsTable.userId });
  return cart;
}

export function createGuestCartToken() {
  return randomBytes(32).toString("base64url");
}

export async function getCart(owner: CartOwner) {
  const cart = await ensureCart(owner);
  const records = await db.select().from(cartItemsTable).where(eq(cartItemsTable.cartId, cart.id)).orderBy(cartItemsTable.id);
  const products = await listCatalogProducts();
  const items = records.flatMap((item) => {
    const product = products.find((entry) => entry.id === item.productId);
    return product
      ? [{ id: item.id, quantity: item.quantity, product: toProduct(product), lineTotal: product.price * item.quantity }]
      : [];
  });
  return {
    id: cart.id,
    items,
    subtotal: items.reduce((total, item) => total + item.lineTotal, 0),
    itemCount: items.reduce((total, item) => total + item.quantity, 0),
  };
}

export async function getCartForUser(userId: number) {
  return getCart({ userId });
}

export async function addToCart(userId: number, productId: number, quantity: number) {
  return addToCartForOwner({ userId }, productId, quantity);
}

export async function addToCartForOwner(owner: CartOwner, productId: number, quantity: number) {
  const product = await getCatalogProductById(productId);
  if (!product || product.stock < quantity) return null;
  const cart = await ensureCart(owner);
  await db
    .insert(cartItemsTable)
    .values({ cartId: cart.id, productId, quantity })
    .onConflictDoUpdate({
      target: [cartItemsTable.cartId, cartItemsTable.productId],
      set: { quantity: sql`least(${cartItemsTable.quantity} + ${quantity}, ${product.stock})`, updatedAt: new Date() },
    });
  return getCart(owner);
}

export async function updateCartItem(userId: number, itemId: number, quantity: number) {
  return updateCartItemForOwner({ userId }, itemId, quantity);
}

export async function updateCartItemForOwner(owner: CartOwner, itemId: number, quantity: number) {
  const [item] = await db
    .select({ productId: cartItemsTable.productId })
    .from(cartItemsTable)
    .innerJoin(cartsTable, eq(cartItemsTable.cartId, cartsTable.id))
    .where(and(eq(cartItemsTable.id, itemId), ownerWhere(owner)))
    .limit(1);
  if (!item) return null;
  const product = await getCatalogProductById(item.productId);
  if (!product) return null;
  await db.update(cartItemsTable).set({ quantity: Math.min(quantity, product.stock), updatedAt: new Date() }).where(eq(cartItemsTable.id, itemId));
  return getCart(owner);
}

export async function removeCartItem(userId: number, itemId: number) {
  return removeCartItemForOwner({ userId }, itemId);
}

export async function removeCartItemForOwner(owner: CartOwner, itemId: number) {
  const cart = await ensureCart(owner);
  await db.delete(cartItemsTable).where(and(eq(cartItemsTable.id, itemId), eq(cartItemsTable.cartId, cart.id)));
  return getCart(owner);
}

export async function claimGuestCart(userId: number, guestToken: string) {
  await db.transaction(async (tx) => {
    const [guestCart] = await tx.select().from(cartsTable).where(eq(cartsTable.guestToken, guestToken)).limit(1);
    if (!guestCart) return;
    await tx.execute(sql`select id from ${cartsTable} where id = ${guestCart.id} for update`);
    const [userCart] = await tx
      .insert(cartsTable)
      .values({ userId })
      .onConflictDoUpdate({ target: cartsTable.userId, set: { updatedAt: new Date() } })
      .returning();
    const guestItems = await tx.select().from(cartItemsTable).where(eq(cartItemsTable.cartId, guestCart.id));
    for (const item of guestItems) {
      const [product] = await tx
        .select({ stock: productsTable.stockQuantity })
        .from(productsTable)
        .where(and(eq(productsTable.id, item.productId), eq(productsTable.isActive, true), eq(productsTable.sellable, true)))
        .limit(1);
      const stock = product?.stock;
      if (!stock) continue;
      await tx.insert(cartItemsTable).values({ cartId: userCart.id, productId: item.productId, quantity: item.quantity })
        .onConflictDoUpdate({
          target: [cartItemsTable.cartId, cartItemsTable.productId],
          set: { quantity: sql`least(${cartItemsTable.quantity} + ${item.quantity}, ${stock})`, updatedAt: new Date() },
        });
    }
    await tx.delete(cartsTable).where(eq(cartsTable.id, guestCart.id));
  });
}

export async function getAddresses(userId: number) {
  return db
    .select({
      id: addressesTable.id,
      userId: addressesTable.userId,
      label: addressesTable.label,
      city: addressesTable.city,
      district: addressesTable.district,
      street: addressesTable.street,
      buildingNo: addressesTable.buildingNo,
      additionalInfo: addressesTable.additionalInfo,
      isDefault: addressesTable.isDefault,
    })
    .from(addressesTable)
    .where(eq(addressesTable.userId, userId))
    .orderBy(desc(addressesTable.isDefault), addressesTable.id);
}

export async function addAddress(userId: number, value: Omit<AddressRecord, "id" | "userId">) {
  return db.transaction(async (tx) => {
    if (value.isDefault) {
      await tx.execute(sql`select id from ${customersTable} where ${customersTable.id} = ${userId} for update`);
      await tx.update(addressesTable).set({ isDefault: false }).where(eq(addressesTable.userId, userId));
    }
    const [address] = await tx.insert(addressesTable).values({ userId, ...value }).returning();
    return address;
  });
}

export async function deleteAddress(userId: number, addressId: number) {
  const deleted = await db
    .delete(addressesTable)
    .where(and(eq(addressesTable.id, addressId), eq(addressesTable.userId, userId)))
    .returning({ id: addressesTable.id });
  return deleted.length > 0;
}

function couponResult(
  coupon: typeof couponsTable.$inferSelect | undefined,
  subtotal: number,
) {
  if (!coupon) {
    return { valid: false, discount: 0, message: "كود الخصم غير صالح أو منتهي الصلاحية", code: null, couponId: null };
  }
  const rawDiscount = coupon.discountType === "percentage"
    ? subtotal * coupon.discountValue / 100
    : coupon.discountValue;
  const discount = Math.min(subtotal, Math.round(rawDiscount * 100) / 100);
  const suffix = coupon.discountType === "percentage"
    ? `${coupon.discountValue}٪`
    : `${coupon.discountValue} ريال سعودي`;
  return {
    valid: true,
    discount,
    message: `تم تطبيق خصم ${suffix}`,
    code: coupon.code,
    couponId: coupon.id,
  };
}

export async function getCoupon(code: string, subtotal: number) {
  await ensureCatalogSeeded();
  const normalizedCode = code.trim().toUpperCase();
  const [coupon] = await db
    .select()
    .from(couponsTable)
    .where(and(
      eq(couponsTable.code, normalizedCode),
      eq(couponsTable.isActive, true),
      sql`(${couponsTable.expiresAt} is null or ${couponsTable.expiresAt} > now())`,
      sql`(${couponsTable.usageLimit} is null or ${couponsTable.timesUsed} < ${couponsTable.usageLimit})`,
    ))
    .limit(1);
  return couponResult(coupon, subtotal);
}

export async function getQuote(userId: number, city: string, couponCode?: string | null) {
  const cart = await getCartForUser(userId);
  const coupon = couponCode ? await getCoupon(couponCode, cart.subtotal) : { discount: 0 };
  const shippingCost = city.trim().toLowerCase().includes("الرياض") || city.trim().toLowerCase().includes("riyadh") ? 20 : 30;
  const net = Math.max(0, cart.subtotal - coupon.discount);
  const taxableGrossCents = Math.round((net + shippingCost) * 100);
  const tax = extractVatFromGross(taxableGrossCents, 15).vatCents / 100;
  return {
    subtotal: cart.subtotal,
    shippingCost,
    discount: coupon.discount,
    tax,
    total: Math.round((net + shippingCost) * 100) / 100,
    shippingMethods: [
      { id: "storage-station-standard", name: "توصيل قياسي", description: "عبر Storage Station", price: shippingCost, estimatedDays: "2–4 أيام عمل" },
    ],
    paymentMethods: [
      { id: "moyasar", name: "مدى، فيزا، Apple Pay", description: "دفع آمن عبر Moyasar", available: true },
      { id: "tabby", name: "تابي", description: "قسّمها على 4 دفعات", available: true },
      { id: "tamara", name: "تمارا", description: "ادفع لاحقاً بكل سهولة", available: true },
    ],
  };
}

type OrderInputDetails = {
  address: Omit<AddressRecord, "id" | "userId">;
  shippingMethod: string;
  paymentMethod: string;
};

export async function createOrderForUser(
  userId: number,
  details: OrderInputDetails,
  couponCode?: string | null,
  trustedPayment?: { confirmedByProvider: true; environment?: NodeJS.ProcessEnv },
  referralCode?: string | null,
) {
  await ensureStandardAccountingChart();
  const createdOrder = await db.transaction(async (tx) => {
    const [cart] = await tx.select().from(cartsTable).where(eq(cartsTable.userId, userId)).limit(1);
    if (!cart) return null;
    await tx.execute(sql`select id from ${cartsTable} where id = ${cart.id} for update`);
    await tx.execute(sql`select id from ${cartItemsTable} where cart_id = ${cart.id} for update`);
    const records = await tx.select().from(cartItemsTable).where(eq(cartItemsTable.cartId, cart.id)).orderBy(cartItemsTable.id);
    if (records.length === 0) return null;
    const items: Array<{ record: typeof records[number]; product: typeof productsTable.$inferSelect }> = [];
    for (const record of [...records].sort((left, right) => left.productId - right.productId)) {
      await tx.execute(sql`select id from ${productsTable} where ${productsTable.id} = ${record.productId} for update`);
      const [product] = await tx.select().from(productsTable)
        .where(and(eq(productsTable.id, record.productId), eq(productsTable.isActive, true)))
        .limit(1);
      if (!product || product.stockQuantity < record.quantity) {
        throw new Error("Insufficient stock to complete this order");
      }
      items.push({ record, product });
    }
    const subtotal = items.reduce((sum, item) => sum + item.product.price * item.record.quantity, 0);
    let coupon: ReturnType<typeof couponResult> = {
      valid: false,
      discount: 0,
      message: "",
      code: null,
      couponId: null,
    };
    let couponRecord: typeof couponsTable.$inferSelect | undefined;
    if (couponCode) {
      const normalizedCode = couponCode.trim().toUpperCase();
      await tx.execute(sql`select id from ${couponsTable} where ${couponsTable.code} = ${normalizedCode} for update`);
      [couponRecord] = await tx
        .select()
        .from(couponsTable)
        .where(and(
          eq(couponsTable.code, normalizedCode),
          eq(couponsTable.isActive, true),
          sql`(${couponsTable.expiresAt} is null or ${couponsTable.expiresAt} > now())`,
          sql`(${couponsTable.usageLimit} is null or ${couponsTable.timesUsed} < ${couponsTable.usageLimit})`,
        ))
        .limit(1);
      coupon = couponResult(couponRecord, subtotal);
      if (coupon.couponId) {
        await tx
          .update(couponsTable)
          .set({ timesUsed: sql`${couponsTable.timesUsed} + 1` })
          .where(eq(couponsTable.id, coupon.couponId));
      }
    }
    const shippingCost = details.address.city.trim().toLowerCase().includes("الرياض") ||
      details.address.city.trim().toLowerCase().includes("riyadh") ? 20 : 30;
    const net = Math.max(0, subtotal - coupon.discount);
    const taxableGrossCents = Math.round((net + shippingCost) * 100);
    const tax = extractVatFromGross(taxableGrossCents, 15).vatCents / 100;
    const total = Math.round((net + shippingCost) * 100) / 100;
    const orderNumber = await nextIndividualOrderNumber(tx);
    const [created] = await tx.insert(ordersTable).values({
      userId,
      orderNumber,
      subtotal,
      shippingCost,
      discount: coupon.discount,
      couponCode: couponRecord?.code ?? null,
      couponDiscountType: couponRecord?.discountType ?? null,
      couponDiscountValue: couponRecord?.discountValue ?? null,
      tax,
      total,
      address: JSON.stringify({ ...details.address, taxTreatment: "domestic" }),
      shippingMethod: details.shippingMethod,
      paymentMethod: details.paymentMethod,
    }).returning();
    // Coupon attribution wins over the durable referral cookie. The primary key on
    // orderAttributions makes retries idempotent and prevents double counting.
    const [couponLink] = couponRecord
      ? await tx.select({ influencerId: influencerCouponsTable.influencerId }).from(influencerCouponsTable).innerJoin(influencersTable, eq(influencerCouponsTable.influencerId, influencersTable.id)).where(and(eq(influencerCouponsTable.couponId, couponRecord.id), eq(influencersTable.isActive, true))).limit(1)
      : [];
    const [referrer] = !couponLink && referralCode
      ? await tx.select({ id: influencersTable.id, commissionRate: influencersTable.commissionRate }).from(influencersTable).where(and(eq(influencersTable.referralCode, referralCode.trim().toUpperCase()), eq(influencersTable.isActive, true))).limit(1)
      : [];
    const influencerId = couponLink?.influencerId ?? referrer?.id;
    const commissionRate = couponLink ? (await tx.select({ commissionRate: influencersTable.commissionRate }).from(influencersTable).where(eq(influencersTable.id, couponLink.influencerId)).limit(1))[0]?.commissionRate : referrer?.commissionRate;
    if (influencerId && commissionRate !== undefined) {
      await tx.insert(orderAttributionsTable).values({
        orderId: created.id, influencerId, source: couponLink ? "coupon" : "referral",
        commissionRate, commissionAmount: Math.round(created.total * commissionRate / 100 * 100) / 100,
      }).onConflictDoNothing();
    }
    await tx.insert(orderAddressesTable).values({
      orderId: created.id,
      label: details.address.label,
      city: details.address.city,
      district: details.address.district,
      street: details.address.street,
      buildingNo: details.address.buildingNo,
      additionalInfo: details.address.additionalInfo,
      isDefault: details.address.isDefault,
    });
    await tx.insert(shipmentsTable).values({
      channel: "online",
      orderId: created.id,
      destinationCity: details.address.city,
      destinationAddress: [details.address.district, details.address.street, details.address.buildingNo].filter(Boolean).join(", "),
      serviceMethod: details.shippingMethod,
      status: "pending",
      collectedCost: shippingCost,
    });
    const createdItems = await tx.insert(orderItemsTable).values(items.map(({ record, product }) => ({
      orderId: created.id,
      productId: product.id,
      productName: product.nameAr,
      quantity: record.quantity,
      unitPrice: product.price,
      totalPrice: product.price * record.quantity,
      costSnapshot: product.averageCost,
      imageUrl: product.images[0]?.url ?? null,
    }))).returning();
    for (const { record, product } of items) {
      const quantityBefore = product.stockQuantity;
      const quantityAfter = quantityBefore - record.quantity;
      await adjustOperationalBalances(tx, product.id, -record.quantity, product.averageCost, quantityBefore);
      const [updatedProduct] = await tx.update(productsTable)
        .set({ stockQuantity: quantityAfter })
        .where(and(eq(productsTable.id, product.id), eq(productsTable.stockQuantity, quantityBefore)))
        .returning({ id: productsTable.id });
      if (!updatedProduct) throw new Error("Inventory changed while completing order");
      await tx.insert(inventoryMovementsTable).values({
        productId: product.id,
        movementType: "decrease",
        quantityChange: -record.quantity,
        quantityBefore,
        quantityAfter,
        reason: `Order ${orderNumber}`,
        unitCost: product.averageCost,
        totalCost: (Number(product.averageCost) * record.quantity).toFixed(4),
        sourceType: "order",
        sourceId: String(created.id),
        eventKey: `sale-fulfillment:${created.id}:${product.id}`,
        performedBy: null,
      });
    }
    await postFulfillmentCogs(tx, created.id, null, created.orderNumber, created.createdAt.toISOString().slice(0, 10));
    await tx.delete(cartItemsTable).where(eq(cartItemsTable.cartId, cart.id));
    return mapOrder(created, createdItems);
  });
  if (!createdOrder || !trustedPayment?.confirmedByProvider) return createdOrder;
  return completeStorefrontPayment(
    userId,
    createdOrder.orderNumber,
    trustedPayment.environment,
  );
}

/**
 * Trusted payment adapters use this boundary after verifying the provider
 * response. It is intentionally not exposed as a customer-facing route.
 */
export async function completeStorefrontPayment(
  userId: number,
  orderNumber: string,
  environment: NodeJS.ProcessEnv = process.env,
) {
  await ensureAdminSeeded();
  const configuredEmail = (
    environment.ACCOUNTING_SYSTEM_ADMIN_EMAIL ??
    environment.ADMIN_EMAIL ??
    process.env.ACCOUNTING_SYSTEM_ADMIN_EMAIL ??
    process.env.ADMIN_EMAIL
  )?.trim().toLowerCase();
  if (!configuredEmail) {
    throw new Error("ACCOUNTING_SYSTEM_ADMIN_EMAIL or ADMIN_EMAIL must be configured for storefront payment posting");
  }
  const [actor] = await db.select({ id: adminUsersTable.id }).from(adminUsersTable).where(and(
    eq(adminUsersTable.email, configuredEmail),
    eq(adminUsersTable.isActive, true),
  )).limit(1);
  if (!actor) {
    throw new Error(`Configured accounting system actor ${configuredEmail} does not exist or is inactive`);
  }
  const [order] = await db.select({ id: ordersTable.id })
    .from(ordersTable)
    .where(and(eq(ordersTable.userId, userId), eq(ordersTable.orderNumber, orderNumber)))
    .limit(1);
  if (!order) return null;
  const updated = await updateOrderAndIssueInvoice(
    order.id,
    { paymentStatus: "paid" },
    environment,
    actor.id,
  );
  if (!updated) return null;
  const items = await db.select().from(orderItemsTable).where(eq(orderItemsTable.orderId, updated.id));
  return mapOrder(updated, items);
}

function mapOrder(
  order: typeof ordersTable.$inferSelect,
  items: Array<typeof orderItemsTable.$inferSelect>,
): OrderRecord {
  return {
    id: order.id,
    userId: order.userId,
    orderNumber: order.orderNumber,
    subtotal: order.subtotal,
    shippingCost: order.shippingCost,
    discount: order.discount,
    tax: order.tax,
    total: order.total,
    status: order.status as OrderRecord["status"],
    paymentStatus: order.paymentStatus as OrderRecord["paymentStatus"],
    trackingNumber: order.trackingNumber,
    items: items.map(({ productName, quantity, unitPrice, totalPrice, imageUrl }) => ({
      productName, quantity, unitPrice, totalPrice, imageUrl,
    })),
    createdAt: order.createdAt.toISOString(),
  };
}

export async function getOrders(userId: number) {
  const records = await db.select().from(ordersTable).where(eq(ordersTable.userId, userId)).orderBy(desc(ordersTable.createdAt));
  if (records.length === 0) return [];
  const items = await db.select().from(orderItemsTable).where(inArray(orderItemsTable.orderId, records.map((order) => order.id)));
  return records.map((order) => mapOrder(order, items.filter((item) => item.orderId === order.id)));
}

export async function getOrder(userId: number, orderNumber: string) {
  const [order] = await db.select().from(ordersTable)
    .where(and(eq(ordersTable.userId, userId), eq(ordersTable.orderNumber, orderNumber))).limit(1);
  if (!order) return null;
  const items = await db.select().from(orderItemsTable).where(eq(orderItemsTable.orderId, order.id));
  return mapOrder(order, items);
}

export async function updateCustomer(userId: number, name?: string, email?: string | null) {
  const changes: { name?: string; email?: string | null; updatedAt: Date } = { updatedAt: new Date() };
  if (typeof name === "string" && name.trim()) changes.name = name.trim();
  if (email !== undefined) changes.email = email;
  const [user] = await db.update(customersTable).set(changes).where(eq(customersTable.id, userId)).returning({
    id: customersTable.id,
    phone: customersTable.phone,
    name: customersTable.name,
    email: customersTable.email,
    phoneVerified: customersTable.phoneVerified,
  });
  return user ?? null;
}
