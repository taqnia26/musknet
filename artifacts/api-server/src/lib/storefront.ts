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
    nameAr: "العطور",
    nameEn: "Perfumes",
    slug: "perfumes",
    imageUrl: "/api/media/Perfume-01_1787598876724.jpg",
  },
  {
    id: 2,
    nameAr: "عطور الشعر",
    nameEn: "Hair Mists",
    slug: "hair-mists",
    imageUrl: "/api/media/Hair_Mist-07_1787598876720.jpg",
  },
];

export const products: ProductSeed[] = [
  {
    id: 1,
    nameAr: "سولين",
    nameEn: "Solenn",
    slug: "solenn",
    price: 345,
    compareAtPrice: null,
    categorySlug: "perfumes",
    categoryNameAr: "العطور",
    imageUrl: "/api/media/Perfume-01_1787598876724.jpg",
    hoverImageUrl: "/api/media/Perfume-02_1787598876724.jpg",
    isFeatured: true,
    isBestseller: true,
    stock: 16,
    descriptionAr:
      "سولين عطر يلتقط لحظة هادئة من الضوء والدفء. تركيبة متوازنة تمنح حضوراً أنيقاً لا ينسى.",
    descriptionEn:
      "Solenn captures a quiet moment of light and warmth in an elegantly enduring composition.",
    images: [
      "/api/media/Perfume-01_1787598876724.jpg",
      "/api/media/Perfume-02_1787598876724.jpg",
      "/api/media/Perfume-03_1787598876725.jpg",
    ],
    notes: [
      { type: "top", nameAr: "البرغموت", nameEn: "Bergamot" },
      { type: "heart", nameAr: "ورد أبيض", nameEn: "White rose" },
      { type: "base", nameAr: "المسك", nameEn: "Musk" },
    ],
  },
  {
    id: 2,
    nameAr: "أورورا",
    nameEn: "Aurora",
    slug: "aurora",
    price: 365,
    compareAtPrice: 420,
    categorySlug: "perfumes",
    categoryNameAr: "العطور",
    imageUrl: "/api/media/Perfume-04_1787598876726.jpg",
    hoverImageUrl: "/api/media/Perfume-05_1787598876727.jpg",
    isFeatured: true,
    isBestseller: false,
    stock: 9,
    descriptionAr:
      "أورورا عطر شرقي مشرق، صمم ليبقى قريباً من الجلد ويكشف عن عمقه مع كل ساعة.",
    descriptionEn:
      "Aurora is a luminous oriental fragrance designed to reveal a deeper character with every hour.",
    images: [
      "/api/media/Perfume-04_1787598876726.jpg",
      "/api/media/Perfume-05_1787598876727.jpg",
      "/api/media/Perfume-06_1787598876727.jpg",
    ],
    notes: [
      { type: "top", nameAr: "الكمثرى", nameEn: "Pear" },
      { type: "heart", nameAr: "الياسمين", nameEn: "Jasmine" },
      { type: "base", nameAr: "خشب الصندل", nameEn: "Sandalwood" },
    ],
  },
  {
    id: 3,
    nameAr: "مِسْت الشعر – سكون",
    nameEn: "Hair Mist — Sukun",
    slug: "sukun-hair-mist",
    price: 145,
    compareAtPrice: null,
    categorySlug: "hair-mists",
    categoryNameAr: "عطور الشعر",
    imageUrl: "/api/media/Hair_Mist-07_1787598876720.jpg",
    hoverImageUrl: "/api/media/Hair_Mist-08_1787598876721.jpg",
    isFeatured: true,
    isBestseller: true,
    stock: 24,
    descriptionAr:
      "رذاذ شعر خفيف بلمسة مسكية ناعمة، يمنح خصلاتك عطراً يرافقك بهدوء طوال اليوم.",
    descriptionEn:
      "A weightless hair mist with a soft musky trail that stays close all day.",
    images: [
      "/api/media/Hair_Mist-07_1787598876720.jpg",
      "/api/media/Hair_Mist-08_1787598876721.jpg",
      "/api/media/Hair_Mist-09_1787598876723.jpg",
    ],
    notes: [
      { type: "top", nameAr: "زهرة البرتقال", nameEn: "Orange blossom" },
      { type: "heart", nameAr: "الفاوانيا", nameEn: "Peony" },
      { type: "base", nameAr: "المسك الأبيض", nameEn: "White musk" },
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