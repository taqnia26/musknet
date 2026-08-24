import { createHmac, timingSafeEqual } from "node:crypto";

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

export const categories = [
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

export const products: ProductSeed[] = [
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

type CustomerRecord = {
  id: number;
  phone: string;
  name: string;
  email: string | null;
  phoneVerified: boolean;
};

type CartRecord = { id: number; userId: number; items: Array<{ id: number; productId: number; quantity: number }> };
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

const usersByPhone = new Map<string, CustomerRecord>();
const cartsByUser = new Map<number, CartRecord>();
const addressesByUser = new Map<number, AddressRecord[]>();
const ordersByUser = new Map<number, OrderRecord[]>();
const otpByPhone = new Map<string, { code: string; expiresAt: number }>();
let nextUserId = 1;
let nextCartId = 1;
let nextItemId = 1;
let nextAddressId = 1;
let nextOrderId = 1;

const tokenSecret = process.env.SESSION_SECRET ?? "musk-ellolo-development-session-secret";

function sign(value: string) {
  return createHmac("sha256", tokenSecret).update(value).digest("base64url");
}

export function issueToken(userId: number) {
  const payload = `${userId}.${Date.now() + 1000 * 60 * 60 * 24 * 30}`;
  return `${payload}.${sign(payload)}`;
}

export function getUserFromToken(rawToken: string | undefined) {
  if (!rawToken) return null;
  const [userId, expiry, signature] = rawToken.split(".");
  if (!userId || !expiry || !signature || Number(expiry) < Date.now()) return null;
  const payload = `${userId}.${expiry}`;
  const expected = sign(payload);
  if (expected.length !== signature.length) return null;
  if (!timingSafeEqual(Buffer.from(expected), Buffer.from(signature))) return null;

  return Array.from(usersByPhone.values()).find((user) => user.id === Number(userId)) ?? null;
}

export function requestDevelopmentOtp(phone: string) {
  const code = "123456";
  otpByPhone.set(phone, { code, expiresAt: Date.now() + 1000 * 60 * 5 });
  return code;
}

export function verifyDevelopmentOtp(phone: string, code: string) {
  const record = otpByPhone.get(phone);
  if (!record || record.expiresAt < Date.now() || record.code !== code) return null;
  otpByPhone.delete(phone);
  let user = usersByPhone.get(phone);
  if (!user) {
    user = {
      id: nextUserId++,
      phone,
      name: "عميل مسك اللولو",
      email: null,
      phoneVerified: true,
    };
    usersByPhone.set(phone, user);
  }
  return user;
}

export function getCartForUser(userId: number) {
  let cart = cartsByUser.get(userId);
  if (!cart) {
    cart = { id: nextCartId++, userId, items: [] };
    cartsByUser.set(userId, cart);
  }

  const items = cart.items.flatMap((item) => {
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

export function addToCart(userId: number, productId: number, quantity: number) {
  const product = products.find((entry) => entry.id === productId);
  if (!product || product.stock < quantity) return null;
  let cart = cartsByUser.get(userId);
  if (!cart) {
    cart = { id: nextCartId++, userId, items: [] };
    cartsByUser.set(userId, cart);
  }
  const existing = cart.items.find((item) => item.productId === productId);
  if (existing) existing.quantity = Math.min(existing.quantity + quantity, product.stock);
  else cart.items.push({ id: nextItemId++, productId, quantity });
  return getCartForUser(userId);
}

export function updateCartItem(userId: number, itemId: number, quantity: number) {
  const cart = cartsByUser.get(userId);
  const item = cart?.items.find((entry) => entry.id === itemId);
  if (!item) return null;
  const product = products.find((entry) => entry.id === item.productId);
  if (!product) return null;
  item.quantity = Math.min(quantity, product.stock);
  return getCartForUser(userId);
}

export function removeCartItem(userId: number, itemId: number) {
  const cart = cartsByUser.get(userId);
  if (!cart) return getCartForUser(userId);
  cart.items = cart.items.filter((item) => item.id !== itemId);
  return getCartForUser(userId);
}

export function getAddresses(userId: number) {
  return addressesByUser.get(userId) ?? [];
}

export function addAddress(userId: number, value: Omit<AddressRecord, "id" | "userId">) {
  const addresses = addressesByUser.get(userId) ?? [];
  if (value.isDefault) addresses.forEach((address) => (address.isDefault = false));
  const address = { id: nextAddressId++, userId, ...value };
  addresses.push(address);
  addressesByUser.set(userId, addresses);
  return address;
}

export function deleteAddress(userId: number, addressId: number) {
  const addresses = addressesByUser.get(userId) ?? [];
  const next = addresses.filter((address) => address.id !== addressId);
  const deleted = next.length !== addresses.length;
  addressesByUser.set(userId, next);
  return deleted;
}

export function getCoupon(code: string, subtotal: number) {
  if (code.trim().toUpperCase() === "ELLOLO10" && subtotal >= 200) {
    return { valid: true, discount: Math.round(subtotal * 0.1 * 100) / 100, message: "تم تطبيق خصم 10٪", code: "ELLOLO10" };
  }
  return { valid: false, discount: 0, message: "كود الخصم غير صالح أو لا يطابق الحد الأدنى للطلب", code: null };
}

export function getQuote(userId: number, city: string, couponCode?: string | null) {
  const cart = getCartForUser(userId);
  const coupon = couponCode ? getCoupon(couponCode, cart.subtotal) : { discount: 0 };
  const shippingCost = city.trim().toLowerCase().includes("الرياض") || city.trim().toLowerCase().includes("riyadh") ? 20 : 30;
  const net = Math.max(0, cart.subtotal - coupon.discount);
  const tax = Math.round(net * 0.15 * 100) / 100;
  return {
    subtotal: cart.subtotal,
    shippingCost,
    discount: coupon.discount,
    tax,
    total: Math.round((net + shippingCost + tax) * 100) / 100,
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

export function createOrderForUser(
  userId: number,
  city: string,
  couponCode?: string | null,
) {
  const cart = getCartForUser(userId);
  if (cart.items.length === 0) return null;
  const quote = getQuote(userId, city, couponCode);
  const order: OrderRecord = {
    id: nextOrderId++,
    userId,
    orderNumber: `ME-${String(10000 + nextOrderId).slice(-5)}`,
    subtotal: quote.subtotal,
    shippingCost: quote.shippingCost,
    discount: quote.discount,
    tax: quote.tax,
    total: quote.total,
    status: "new",
    paymentStatus: "pending",
    trackingNumber: null,
    items: cart.items.map((item) => ({
      productName: item.product.nameAr,
      quantity: item.quantity,
      unitPrice: item.product.price,
      totalPrice: item.lineTotal,
      imageUrl: item.product.imageUrl,
    })),
    createdAt: new Date().toISOString(),
  };
  ordersByUser.set(userId, [order, ...(ordersByUser.get(userId) ?? [])]);
  cartsByUser.set(userId, { id: nextCartId++, userId, items: [] });
  return order;
}

export function getOrders(userId: number) {
  return ordersByUser.get(userId) ?? [];
}

export function updateCustomer(userId: number, name?: string, email?: string | null) {
  const user = Array.from(usersByPhone.values()).find((entry) => entry.id === userId);
  if (!user) return null;
  if (typeof name === "string" && name.trim()) user.name = name.trim();
  if (email !== undefined) user.email = email;
  return user;
}