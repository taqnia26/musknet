import { Router, type IRouter, type Request, type Response } from "express";
import {
  AddCartItemBody,
  AddCartItemResponse,
  CreateAddressBody,
  CreateAddressResponse,
  CreateOrderBody,
  CreateOrderResponse,
  DeleteAddressParams,
  GetCartResponse,
  GetCheckoutQuoteBody,
  GetCheckoutQuoteResponse,
  GetCurrentUserResponse,
  GetHomeContentResponse,
  GetOrderParams,
  GetOrderResponse,
  GetProductParams,
  GetProductResponse,
  GetRelatedProductsParams,
  GetRelatedProductsResponse,
  ListAddressesResponse,
  ListCategoriesResponse,
  ListOrdersResponse,
  ListProductsQueryParams,
  ListProductsResponse,
  RequestOtpBody,
  RemoveCartItemParams,
  RemoveCartItemResponse,
  RequestOtpResponse,
  UpdateCartItemBody,
  UpdateCartItemParams,
  UpdateCartItemResponse,
  UpdateProfileBody,
  UpdateProfileResponse,
  ValidateCouponBody,
  ValidateCouponResponse,
  VerifyOtpBody,
  VerifyOtpResponse,
} from "@workspace/api-zod";
import {
  addAddress,
  addToCartForOwner,
  categories,
  createGuestCartToken,
  createOrderForUser,
  deleteAddress,
  getAddresses,
  getCart,
  getCoupon,
  getOrders,
  getOrder,
  getQuote,
  getUserFromToken,
  issueToken,
  products,
  requestDevelopmentOtp,
  removeCartItemForOwner,
  toProduct,
  updateCartItemForOwner,
  updateCustomer,
  verifyDevelopmentOtp,
} from "../lib/storefront";

const router: IRouter = Router();

async function currentUser(req: Request) {
  const header = req.header("authorization");
  const raw = header?.startsWith("Bearer ") ? header.slice("Bearer ".length) : undefined;
  return getUserFromToken(raw);
}

async function requireUser(req: Request, res: Response) {
  const user = await currentUser(req);
  if (!user) {
    res.status(401).json({ error: "يلزم تسجيل الدخول للمتابعة" });
    return null;
  }
  return user;
}

function asyncRoute(handler: (req: Request, res: Response) => Promise<void>) {
  return (req: Request, res: Response, next: (error?: unknown) => void) => {
    handler(req, res).catch(next);
  };
}

const guestCartCookie = "musk_ellolo_guest_cart";
const guestCartCookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  maxAge: 1000 * 60 * 60 * 24 * 30,
  path: "/api",
};

async function cartOwner(req: Request, res: Response) {
  const user = await currentUser(req);
  if (user) return { userId: user.id };
  const existing = req.cookies?.[guestCartCookie];
  if (typeof existing === "string" && /^[A-Za-z0-9_-]{43}$/.test(existing)) {
    return { guestToken: existing };
  }
  const guestToken = createGuestCartToken();
  res.cookie(guestCartCookie, guestToken, guestCartCookieOptions);
  return { guestToken };
}

router.get("/categories", (_req, res) => {
  res.json(ListCategoriesResponse.parse(categories));
});

router.get("/products", (req, res) => {
  const parsed = ListProductsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { category, sort, search, minPrice, maxPrice, limit } = parsed.data;
  const needle = search?.trim().toLowerCase();
  let entries = products.filter((product) => {
    const matchesCategory = !category || product.categorySlug === category;
    const matchesSearch =
      !needle ||
      product.nameAr.toLowerCase().includes(needle) ||
      product.nameEn.toLowerCase().includes(needle);
    const matchesMin = minPrice === undefined || product.price >= minPrice;
    const matchesMax = maxPrice === undefined || product.price <= maxPrice;
    return matchesCategory && matchesSearch && matchesMin && matchesMax;
  });
  if (sort === "price_asc") entries = [...entries].sort((a, b) => a.price - b.price);
  if (sort === "price_desc") entries = [...entries].sort((a, b) => b.price - a.price);
  if (sort === "bestseller") entries = [...entries].sort((a, b) => Number(b.isBestseller) - Number(a.isBestseller));
  res.json(ListProductsResponse.parse(entries.slice(0, limit).map(toProduct)));
});

router.get("/products/:slug", (req, res) => {
  const parsed = GetProductParams.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const product = products.find((entry) => entry.slug === parsed.data.slug);
  if (!product) {
    res.status(404).json({ error: "المنتج غير موجود" });
    return;
  }
  const relatedProducts = products
    .filter((entry) => entry.categorySlug === product.categorySlug && entry.id !== product.id)
    .map(toProduct);
  res.json(GetProductResponse.parse({ ...product, relatedProducts }));
});

router.get("/products/:slug/related", (req, res) => {
  const parsed = GetRelatedProductsParams.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const product = products.find((entry) => entry.slug === parsed.data.slug);
  const related = product
    ? products
        .filter((entry) => entry.categorySlug === product.categorySlug && entry.id !== product.id)
        .map(toProduct)
    : [];
  res.json(GetRelatedProductsResponse.parse(related));
});

router.get("/content/home", (_req, res) => {
  res.json(
    GetHomeContentResponse.parse({
      heroTitleAr: "حيثُ يُحَسّ الفخامة، لا تُقال.",
      heroTitleEn: "Where luxury is felt, not spoken.",
      heroSubtitleAr: "عطور صنعت لتترك أثراً يخصّك وحدك.",
      heroSubtitleEn: "Fragrances created to become unmistakably yours.",
      heroImageUrl: "/api/media/Perfume-01_1787598876724.jpg",
      heroVideoUrl: null,
      aboutTitleAr: "قصة مسك اللولو",
      aboutBodyAr:
        "منذ 2011، نبحث عن العطر الذي لا يشبه سواه. نعمل مع صناع عطور عالميين لنحوّل الذكريات إلى توقيع شخصي يرافقك.",
      aboutImageUrl: "/api/media/Perfume-04_1787598876726.jpg",
      creativeTitleAr: "العقل المبدع خلف العطور",
      creativeBodyAr:
        "كل تركيبة تبدأ بفكرة: توازن لا يُرى بين الضوء، الذاكرة، والمكوّن النادر.",
      creativeImageUrl: "/api/media/Hair_Mist-07_1787598876720.jpg",
    }),
  );
});

router.post("/auth/request-otp", asyncRoute(async (req, res) => {
  const parsed = RequestOtpBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const devCode = await requestDevelopmentOtp(parsed.data.phone);
  req.log.info({ phoneSuffix: parsed.data.phone.slice(-4) }, "Development OTP issued");
  res.json(RequestOtpResponse.parse({ success: true, expiresInSeconds: 300, devCode }));
}));

router.post("/auth/verify-otp", asyncRoute(async (req, res) => {
  const parsed = VerifyOtpBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const guestToken = req.cookies?.[guestCartCookie];
  const validGuestToken = typeof guestToken === "string" && /^[A-Za-z0-9_-]{43}$/.test(guestToken) ? guestToken : undefined;
  const user = await verifyDevelopmentOtp(parsed.data.phone, parsed.data.code, validGuestToken);
  if (!user) {
    res.status(400).json({ error: "رمز التحقق غير صحيح أو انتهت صلاحيته" });
    return;
  }
  if (validGuestToken) {
    res.clearCookie(guestCartCookie, { path: "/api", httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production" });
  }
  res.json(VerifyOtpResponse.parse({ token: issueToken(user.id), user }));
}));

router.get("/auth/me", asyncRoute(async (req, res) => {
  const user = await requireUser(req, res);
  if (!user) return;
  res.json(GetCurrentUserResponse.parse(user));
}));

router.get("/cart", asyncRoute(async (req, res) => {
  res.json(GetCartResponse.parse(await getCart(await cartOwner(req, res))));
}));

router.post("/cart/items", asyncRoute(async (req, res) => {
  const parsed = AddCartItemBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const cart = await addToCartForOwner(await cartOwner(req, res), parsed.data.productId, parsed.data.quantity);
  if (!cart) {
    res.status(400).json({ error: "المنتج غير متوفر بالكمية المطلوبة" });
    return;
  }
  res.json(AddCartItemResponse.parse(cart));
}));

router.patch("/cart/items/:itemId", asyncRoute(async (req, res) => {
  const params = UpdateCartItemParams.safeParse(req.params);
  const body = UpdateCartItemBody.safeParse(req.body);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }
  const cart = await updateCartItemForOwner(await cartOwner(req, res), params.data.itemId, body.data.quantity);
  if (!cart) {
    res.status(404).json({ error: "عنصر السلة غير موجود" });
    return;
  }
  res.json(UpdateCartItemResponse.parse(cart));
}));

router.delete("/cart/items/:itemId", asyncRoute(async (req, res) => {
  const parsed = RemoveCartItemParams.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  res.json(RemoveCartItemResponse.parse(await removeCartItemForOwner(await cartOwner(req, res), parsed.data.itemId)));
}));

router.post("/coupons/validate", (req, res) => {
  const parsed = ValidateCouponBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  res.json(ValidateCouponResponse.parse(getCoupon(parsed.data.code, parsed.data.subtotal)));
});

router.post("/checkout/quote", asyncRoute(async (req, res) => {
  const user = await requireUser(req, res);
  if (!user) return;
  const parsed = GetCheckoutQuoteBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  res.json(GetCheckoutQuoteResponse.parse(await getQuote(user.id, parsed.data.city, parsed.data.couponCode)));
}));

router.get("/orders", asyncRoute(async (req, res) => {
  const user = await requireUser(req, res);
  if (!user) return;
  res.json(ListOrdersResponse.parse(await getOrders(user.id)));
}));

router.post("/orders", asyncRoute(async (req, res) => {
  const user = await requireUser(req, res);
  if (!user) return;
  const parsed = CreateOrderBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const order = await createOrderForUser(user.id, {
    address: {
      label: parsed.data.address.label,
      city: parsed.data.address.city,
      district: parsed.data.address.district,
      street: parsed.data.address.street,
      buildingNo: parsed.data.address.buildingNo,
      additionalInfo: parsed.data.address.additionalInfo ?? null,
      isDefault: parsed.data.address.isDefault ?? false,
    },
    shippingMethod: parsed.data.shippingMethod,
    paymentMethod: parsed.data.paymentMethod,
  }, parsed.data.couponCode);
  if (!order) {
    res.status(400).json({ error: "لا يمكن إنشاء طلب من سلة فارغة" });
    return;
  }
  res.status(201).json(CreateOrderResponse.parse(order));
}));

router.get("/orders/:orderNumber", asyncRoute(async (req, res) => {
  const user = await requireUser(req, res);
  if (!user) return;
  const parsed = GetOrderParams.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const order = await getOrder(user.id, parsed.data.orderNumber);
  if (!order) {
    res.status(404).json({ error: "الطلب غير موجود" });
    return;
  }
  res.json(GetOrderResponse.parse(order));
}));

router.patch("/account/profile", asyncRoute(async (req, res) => {
  const user = await requireUser(req, res);
  if (!user) return;
  const parsed = UpdateProfileBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const updated = await updateCustomer(user.id, parsed.data.name, parsed.data.email);
  res.json(UpdateProfileResponse.parse(updated));
}));

router.get("/account/addresses", asyncRoute(async (req, res) => {
  const user = await requireUser(req, res);
  if (!user) return;
  res.json(ListAddressesResponse.parse(await getAddresses(user.id)));
}));

router.post("/account/addresses", asyncRoute(async (req, res) => {
  const user = await requireUser(req, res);
  if (!user) return;
  const parsed = CreateAddressBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const address = await addAddress(user.id, {
    label: parsed.data.label,
    city: parsed.data.city,
    district: parsed.data.district,
    street: parsed.data.street,
    buildingNo: parsed.data.buildingNo,
    additionalInfo: parsed.data.additionalInfo ?? null,
    isDefault: parsed.data.isDefault ?? false,
  });
  res.status(201).json(CreateAddressResponse.parse(address));
}));

router.delete("/account/addresses/:addressId", asyncRoute(async (req, res) => {
  const user = await requireUser(req, res);
  if (!user) return;
  const parsed = DeleteAddressParams.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  if (!await deleteAddress(user.id, parsed.data.addressId)) {
    res.status(404).json({ error: "العنوان غير موجود" });
    return;
  }
  res.status(204).send();
}));

export default router;