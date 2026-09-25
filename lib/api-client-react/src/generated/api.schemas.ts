export type InventoryLocationType = typeof InventoryLocationType[keyof typeof InventoryLocationType];


export const InventoryLocationType = {
  warehouse: 'warehouse',
  store: 'store',
  virtual: 'virtual',
} as const;

export interface InventoryLocation {
  id: number;
  name: string;
  code: string;
  /** @nullable */
  managerName: string | null;
  /** @nullable */
  email: string | null;
  /** @nullable */
  phone: string | null;
  type: InventoryLocationType;
  isDefault: boolean;
  active: boolean;
}

export type InventoryLocationInputType = typeof InventoryLocationInputType[keyof typeof InventoryLocationInputType];


export const InventoryLocationInputType = {
  warehouse: 'warehouse',
  store: 'store',
  virtual: 'virtual',
} as const;

export interface InventoryLocationInput {
  name: string;
  code: string;
  managerName: string;
  /** @pattern ^[^\s@]+@[^\s@]+\.[^\s@]+$ */
  email: string;
  phone: string;
  type?: InventoryLocationInputType;
  isDefault?: boolean;
}

export type InventoryLocationUpdateType = typeof InventoryLocationUpdateType[keyof typeof InventoryLocationUpdateType];


export const InventoryLocationUpdateType = {
  warehouse: 'warehouse',
  store: 'store',
  virtual: 'virtual',
} as const;

export interface InventoryLocationUpdate {
  name: string;
  code: string;
  managerName: string;
  /** @pattern ^[^\s@]+@[^\s@]+\.[^\s@]+$ */
  email: string;
  phone: string;
  type: InventoryLocationUpdateType;
  isDefault: boolean;
  active: boolean;
}

export interface InventoryBalance {
  id: number;
  productId: number;
  locationId: number;
  /** @minimum 0 */
  available: number;
  /** @minimum 0 */
  reserved: number;
  /** @minimum 0 */
  incoming: number;
  averageCost: string;
}

export type InventoryAgingRow = InventoryBalance & {
  updatedAt: string;
  /** @minimum 0 */
  ageDays: number;
};

export type InventoryTransferInputLinesItem = {
  productId: number;
  /** @minimum 1 */
  quantity: number;
};

export interface InventoryTransferInput {
  transferNumber: string;
  idempotencyKey: string;
  fromLocationId: number;
  toLocationId: number;
  /** @minItems 1 */
  lines: InventoryTransferInputLinesItem[];
}

export type InventoryTransferStatus = typeof InventoryTransferStatus[keyof typeof InventoryTransferStatus];


export const InventoryTransferStatus = {
  draft: 'draft',
  sent: 'sent',
  received: 'received',
  cancelled: 'cancelled',
} as const;

export interface InventoryTransfer {
  id: number;
  transferNumber: string;
  fromLocationId: number;
  toLocationId: number;
  status: InventoryTransferStatus;
}

export type InventoryPurchaseOrderInputLinesItem = {
  productId: number;
  /** @minimum 1 */
  quantity: number;
  /** @minimum 0 */
  unitCost: string | number;
};

export interface InventoryPurchaseOrderInput {
  orderNumber: string;
  vendorName: string;
  locationId: number;
  idempotencyKey: string;
  /** @minItems 1 */
  lines: InventoryPurchaseOrderInputLinesItem[];
}

export type InventoryReceiptInputReceiptsItem = {
  productId: number;
  /** @minimum 1 */
  quantity: number;
};

export interface InventoryReceiptInput {
  /** @minLength 1 */
  idempotencyKey: string;
  /** @minItems 1 */
  receipts: InventoryReceiptInputReceiptsItem[];
}

export type InventoryPurchaseOrderStatus = typeof InventoryPurchaseOrderStatus[keyof typeof InventoryPurchaseOrderStatus];


export const InventoryPurchaseOrderStatus = {
  draft: 'draft',
  ordered: 'ordered',
  partially_received: 'partially_received',
  received: 'received',
  cancelled: 'cancelled',
} as const;

export type InventoryPurchaseOrderLinesItem = {
  productId: number;
  quantity: number;
  receivedQuantity: number;
  /** @minimum 0 */
  unitCost: string | number;
};

export interface InventoryPurchaseOrder {
  id: number;
  orderNumber: string;
  vendorName: string;
  locationId: number;
  status: InventoryPurchaseOrderStatus;
  lines: InventoryPurchaseOrderLinesItem[];
}

export type InventoryCycleCountInputLinesItem = {
  productId: number;
  /** @minimum 0 */
  countedQuantity: number;
};

export interface InventoryCycleCountInput {
  locationId: number;
  /** @minItems 1 */
  lines: InventoryCycleCountInputLinesItem[];
}

export type InventoryCycleCountStatus = typeof InventoryCycleCountStatus[keyof typeof InventoryCycleCountStatus];


export const InventoryCycleCountStatus = {
  draft: 'draft',
  review: 'review',
  approved: 'approved',
  cancelled: 'cancelled',
} as const;

export type InventoryCycleCountLinesItem = {
  id: number;
  productId: number;
  expectedQuantity: number;
  countedQuantity: number;
  /** @minimum 0 */
  unitCost: string | number;
  /** @nullable */
  note?: string | null;
};

export interface InventoryCycleCount {
  id: number;
  locationId: number;
  status: InventoryCycleCountStatus;
  lines: InventoryCycleCountLinesItem[];
}

export type InventoryAlertStatus = typeof InventoryAlertStatus[keyof typeof InventoryAlertStatus];


export const InventoryAlertStatus = {
  out: 'out',
  low: 'low',
  ok: 'ok',
} as const;

export interface InventoryAlert {
  productId: number;
  /** @nullable */
  sku?: string | null;
  available: number;
  incoming: number;
  reorderPoint: number;
  reorderQuantity: number;
  status: InventoryAlertStatus;
}

export interface InventoryValuationRow {
  locationId: number;
  location: string;
  operationalType: string;
  quantity: number;
  value: number;
}

export interface InventoryAuditRow {
  id: number;
  productId: number;
  /** @nullable */
  sourceType?: string | null;
  /** @nullable */
  sourceId?: string | null;
  quantityChange: number;
  /** @nullable */
  performedBy?: number | null;
  /** @nullable */
  performerName?: string | null;
  createdAt: string;
}

export type AdminInventoryMovementMovementType = typeof AdminInventoryMovementMovementType[keyof typeof AdminInventoryMovementMovementType];


export const AdminInventoryMovementMovementType = {
  increase: 'increase',
  decrease: 'decrease',
  adjustment: 'adjustment',
} as const;

export interface AdminInventoryMovement {
  id: number;
  productId: number;
  movementType: AdminInventoryMovementMovementType;
  quantityChange: number;
  quantityBefore: number;
  quantityAfter: number;
  /** @nullable */
  reason: string | null;
  /** @nullable */
  sourceType: string | null;
  /** @nullable */
  sourceId: string | null;
  /** @nullable */
  performedBy: number | null;
  /** @nullable */
  performerName: string | null;
  createdAt: string;
}

export interface InventoryMovementPage {
  items: AdminInventoryMovement[];
  page: number;
  pageSize: number;
  total: number;
}

export interface InventoryAuditPage {
  items: InventoryAuditRow[];
  page: number;
  pageSize: number;
  total: number;
}

export type InventoryReconciliationUnlinkedMovementsItem = {
  /** @nullable */
  sourceType?: string | null;
  /** @nullable */
  sourceId?: string | null;
};

export type InventoryReconciliationUnlinkedInventoryJournalsItem = {
  /** @nullable */
  sourceType?: string | null;
  /** @nullable */
  sourceId?: string | null;
};

export interface InventoryReconciliation {
  operationalValue: number;
  accountingInventoryValue: number;
  difference: number;
  unlinkedMovements: InventoryReconciliationUnlinkedMovementsItem[];
  unlinkedInventoryJournals: InventoryReconciliationUnlinkedInventoryJournalsItem[];
}

export interface HealthStatus {
  status: string;
}

export interface Error {
  error: string;
}

export interface Category {
  id: number;
  nameAr: string;
  nameEn: string;
  slug: string;
  imageUrl: string;
}

export interface Product {
  id: number;
  nameAr: string;
  nameEn: string;
  slug: string;
  price: number;
  /** @nullable */
  compareAtPrice?: number | null;
  categorySlug: string;
  categoryNameAr?: string;
  imageUrl: string;
  /** @nullable */
  hoverImageUrl?: string | null;
  isFeatured?: boolean;
  isBestseller: boolean;
  stock: number;
}

export type RichBlockType = typeof RichBlockType[keyof typeof RichBlockType];


export const RichBlockType = {
  paragraph: 'paragraph',
  heading2: 'heading2',
  heading3: 'heading3',
  bullet: 'bullet',
  ordered: 'ordered',
} as const;

export type RichBlockAlign = typeof RichBlockAlign[keyof typeof RichBlockAlign];


export const RichBlockAlign = {
  start: 'start',
  center: 'center',
  end: 'end',
} as const;

export type RichBlockEffect = typeof RichBlockEffect[keyof typeof RichBlockEffect];


export const RichBlockEffect = {
  none: 'none',
  fade: 'fade',
  zoom: 'zoom',
  rise: 'rise',
  drop: 'drop',
  'slide-left': 'slide-left',
  'slide-right': 'slide-right',
  blur: 'blur',
  rotate: 'rotate',
  flip: 'flip',
  bounce: 'bounce',
} as const;

export type RichSpanColor = typeof RichSpanColor[keyof typeof RichSpanColor];


export const RichSpanColor = {
  default: 'default',
  red: 'red',
  blue: 'blue',
  gold: 'gold',
} as const;

export interface RichSpan {
  /** @maxLength 2000 */
  text: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  color?: RichSpanColor;
  /**
     * @maxLength 2048
     * @pattern ^(https?://|mailto:)[^\s<>]*$
     */
  href?: string;
}

export interface RichBlock {
  type: RichBlockType;
  align: RichBlockAlign;
  effect: RichBlockEffect;
  /**
     * @minimum 0.5
     * @maximum 2
     */
  effectSpeed?: number;
  /** @maxItems 100 */
  content: RichSpan[];
}

export interface RichDescription {
  /** @maxItems 100 */
  blocks: RichBlock[];
}

export type FragranceNoteType = typeof FragranceNoteType[keyof typeof FragranceNoteType];


export const FragranceNoteType = {
  top: 'top',
  heart: 'heart',
  base: 'base',
} as const;

export interface FragranceNote {
  type: FragranceNoteType;
  nameAr: string;
  nameEn: string;
}

export type ProductDetails = Product & ({
  descriptionAr: string;
  descriptionEn: string;
  descriptionRichAr: RichDescription | null;
  descriptionRichEn: RichDescription | null;
  images: string[];
  notes: FragranceNote[];
  relatedProducts: Product[];
});

export interface HomeContent {
  heroTitleAr: string;
  heroTitleEn: string;
  heroSubtitleAr: string;
  heroSubtitleEn: string;
  /** @nullable */
  heroImageUrl?: string | null;
  /** @nullable */
  heroVideoUrl?: string | null;
  aboutTitleAr: string;
  aboutBodyAr: string;
  /** @nullable */
  aboutImageUrl?: string | null;
  creativeTitleAr: string;
  creativeBodyAr: string;
  /** @nullable */
  creativeImageUrl?: string | null;
}

export interface OtpRequest {
  /** @minLength 8 */
  phone: string;
}

export interface OtpRequestResult {
  success: boolean;
  expiresInSeconds: number;
  /** @nullable */
  devCode?: string | null;
}

export interface OtpVerification {
  phone: string;
  /**
     * @minLength 4
     * @maxLength 6
     */
  code: string;
}

export interface Customer {
  id: number;
  phone: string;
  name: string;
  /** @nullable */
  email?: string | null;
  phoneVerified: boolean;
}

export interface AuthSession {
  token: string;
  user: Customer;
}

export interface CartItem {
  id: number;
  quantity: number;
  lineTotal: number;
  product: Product;
}

export interface Cart {
  id: number;
  items: CartItem[];
  subtotal: number;
  itemCount: number;
}

export interface CartItemInput {
  productId: number;
  /**
     * @minimum 1
     * @maximum 20
     */
  quantity: number;
}

export interface CartItemUpdate {
  /**
     * @minimum 1
     * @maximum 20
     */
  quantity: number;
}

export interface CouponValidation {
  code: string;
  /** @minimum 0 */
  subtotal: number;
}

export interface CouponResult {
  valid: boolean;
  discount: number;
  message: string;
  /** @nullable */
  code?: string | null;
}

export type CheckoutQuoteInputShippingMethod = typeof CheckoutQuoteInputShippingMethod[keyof typeof CheckoutQuoteInputShippingMethod];


export const CheckoutQuoteInputShippingMethod = {
  refrigerated: 'refrigerated',
  regular: 'regular',
} as const;

export interface CheckoutQuoteInput {
  city: string;
  shippingMethod: CheckoutQuoteInputShippingMethod;
  /** @nullable */
  couponCode?: string | null;
}

export interface ShippingMethod {
  id: string;
  name: string;
  description: string;
  price: number;
  estimatedDays: string;
}

export type PaymentMethodId = typeof PaymentMethodId[keyof typeof PaymentMethodId];


export const PaymentMethodId = {
  moyasar: 'moyasar',
  tabby: 'tabby',
  tamara: 'tamara',
} as const;

export interface PaymentMethod {
  id: PaymentMethodId;
  name: string;
  description: string;
  available: boolean;
}

export interface CheckoutQuote {
  subtotal: number;
  shippingCost: number;
  discount: number;
  tax: number;
  total: number;
  shippingMethods: ShippingMethod[];
  paymentMethods: PaymentMethod[];
}

export type OrderInputShippingMethod = typeof OrderInputShippingMethod[keyof typeof OrderInputShippingMethod];


export const OrderInputShippingMethod = {
  refrigerated: 'refrigerated',
  regular: 'regular',
} as const;

export type OrderInputPaymentMethod = typeof OrderInputPaymentMethod[keyof typeof OrderInputPaymentMethod];


export const OrderInputPaymentMethod = {
  moyasar: 'moyasar',
  tabby: 'tabby',
  tamara: 'tamara',
} as const;

export interface AddressInput {
  label: string;
  city: string;
  district: string;
  street: string;
  buildingNo: string;
  /** @nullable */
  additionalInfo?: string | null;
  isDefault?: boolean;
}

export interface OrderInput {
  address: AddressInput;
  shippingMethod: OrderInputShippingMethod;
  paymentMethod: OrderInputPaymentMethod;
  /** @nullable */
  couponCode?: string | null;
}

export type OrderStatus = typeof OrderStatus[keyof typeof OrderStatus];


export const OrderStatus = {
  cancelled: 'cancelled',
  returned: 'returned',
  pending_review: 'pending_review',
  preparing: 'preparing',
  out_for_delivery: 'out_for_delivery',
  delivered: 'delivered',
  pending_payment: 'pending_payment',
} as const;

export type OrderPaymentStatus = typeof OrderPaymentStatus[keyof typeof OrderPaymentStatus];


export const OrderPaymentStatus = {
  pending: 'pending',
  paid: 'paid',
  failed: 'failed',
  refunded: 'refunded',
} as const;

export interface OrderItem {
  productName: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  /** @nullable */
  imageUrl?: string | null;
}

export interface Order {
  id: number;
  orderNumber: string;
  subtotal: number;
  shippingCost: number;
  discount: number;
  tax: number;
  total: number;
  status: OrderStatus;
  paymentStatus: OrderPaymentStatus;
  /** @nullable */
  trackingNumber?: string | null;
  items: OrderItem[];
  createdAt: string;
}

export interface ProfileUpdate {
  name?: string;
  /** @nullable */
  email?: string | null;
}

export interface Address {
  id: number;
  label: string;
  city: string;
  district: string;
  street: string;
  buildingNo: string;
  /** @nullable */
  additionalInfo?: string | null;
  isDefault: boolean;
}

export interface AdminLoginInput {
  email: string;
  /** @minLength 8 */
  password: string;
}

export interface OwnerLoginInput {
  /** @pattern ^[^\s@]+@[^\s@]+\.[^\s@]+$ */
  email: string;
  /** @minLength 8 */
  password: string;
}

export interface OwnerCredentialsInput {
  email: string;
  /** @minLength 8 */
  password?: string;
  /** @minLength 8 */
  passwordConfirmation?: string;
}

export interface OwnerCredentialsStatus {
  configured: boolean;
  /** @nullable */
  email: string | null;
  /** @nullable */
  updatedAt: string | null;
}

export interface AdminUser {
  id: number;
  email: string;
  name: string;
  /** @nullable */
  jobTitle: string | null;
  /** @nullable */
  phone: string | null;
  isSuperAdmin: boolean;
  isActive: boolean;
  permissions: string[];
  /** @nullable */
  lastLoginAt?: string | null;
  createdAt: string;
}

export interface AdminAuthSession {
  token: string;
  user: AdminUser;
}

export interface OwnerUser {
  id: number;
  email: string;
  name: string;
  isActive: boolean;
  /** @nullable */
  lastLoginAt?: string | null;
  createdAt: string;
}

export interface OwnerSession {
  id: number;
  deviceLabel: string;
  browser: string;
  operatingSystem: string;
  expiresAt: string;
  createdAt: string;
  isCurrent: boolean;
}

export interface OwnerAuthSession {
  token: string;
  user: OwnerUser;
  session: OwnerSession;
}

export interface OwnerSessionNotification {
  id: number;
  newSessionId: number;
  deviceLabel: string;
  browser: string;
  operatingSystem: string;
  sessionCreatedAt: string;
  createdAt: string;
}

export type AdminPermissionAction = typeof AdminPermissionAction[keyof typeof AdminPermissionAction];


export const AdminPermissionAction = {
  view: 'view',
  edit: 'edit',
  delete: 'delete',
} as const;

export interface AdminPermission {
  id: number;
  module: string;
  action: AdminPermissionAction;
  key: string;
}

export interface AdminDashboard {
  revenue: number;
  orders: number;
  customers: number;
  products: number;
  lowStock: number;
  pendingOrders: number;
  activeCoupons: number;
  distributors: number;
}

export type AdminAnalyticsDashboardPeriod = {
  from: string;
  to: string;
};

export type AdminAnalyticsDashboardSummary = {
  visits: number;
  pageViews: number;
  orders: number;
  revenue: number;
  conversionRate: number;
  averageOrderValue: number;
};

export type AdminAnalyticsDashboardSeriesItem = {
  date: string;
  visits: number;
  pageViews: number;
  orders: number;
  revenue: number;
};

export type AdminAnalyticsDashboardTopProductsItem = {
  name: string;
  quantity: number;
  revenue: number;
};

export type AdminAnalyticsDashboardTrafficSourcesItemSource = typeof AdminAnalyticsDashboardTrafficSourcesItemSource[keyof typeof AdminAnalyticsDashboardTrafficSourcesItemSource];


export const AdminAnalyticsDashboardTrafficSourcesItemSource = {
  direct: 'direct',
  search: 'search',
  social: 'social',
  referral: 'referral',
} as const;

export type AdminAnalyticsDashboardTrafficSourcesItem = {
  source: AdminAnalyticsDashboardTrafficSourcesItemSource;
  visits: number;
};

export interface AdminAnalyticsDashboard {
  rangeDays: number;
  period: AdminAnalyticsDashboardPeriod;
  summary: AdminAnalyticsDashboardSummary;
  series: AdminAnalyticsDashboardSeriesItem[];
  topProducts: AdminAnalyticsDashboardTopProductsItem[];
  trafficSources: AdminAnalyticsDashboardTrafficSourcesItem[];
}

export type AdminRevenueAnalyticsCurrency = typeof AdminRevenueAnalyticsCurrency[keyof typeof AdminRevenueAnalyticsCurrency];


export const AdminRevenueAnalyticsCurrency = {
  SAR: 'SAR',
} as const;

export interface ProductMovementMetric {
  productId: number;
  nameAr: string;
  nameEn: string;
  /** @nullable */
  sku: string | null;
  quantity: number;
  transactions: number;
}

export type AdminRevenueAnalyticsProductMovements = {
  online: ProductMovementMetric[];
  companies: ProductMovementMetric[];
};

export interface ShippingFinancialMetric {
  shipmentCount: number;
  shippedCount: number;
  quantity: number;
  amountRequired: number;
  amountPaid: number;
  outstandingAmount: number;
  actualCost: number;
  collectedCost: number;
  netCost: number;
}

export type AdminRevenueAnalyticsShipping = {
  total: ShippingFinancialMetric;
  online: ShippingFinancialMetric;
  companies: ShippingFinancialMetric;
  domestic: ShippingFinancialMetric;
  international: ShippingFinancialMetric;
};

export interface AnalyticsDatePeriod {
  from: string;
  to: string;
}

export interface RevenueAnalyticsSummary {
  onlineRevenue: number;
  companyRevenue: number;
  totalRevenue: number;
  onlineOrders: number;
  companyInvoices: number;
  activeCompanies: number;
  changePct: number;
}

export interface RevenueTrendPoint {
  date: string;
  onlineRevenue: number;
  companyRevenue: number;
  totalRevenue: number;
}

export interface CompanyRevenueMetric {
  companyId: number;
  companyName: string;
  revenue: number;
  previousRevenue: number;
  invoices: number;
  sharePct: number;
  changePct: number;
}

export interface AdminRevenueAnalytics {
  rangeDays: number;
  currency: AdminRevenueAnalyticsCurrency;
  period: AnalyticsDatePeriod;
  previousPeriod: AnalyticsDatePeriod;
  summary: RevenueAnalyticsSummary;
  previousSummary: RevenueAnalyticsSummary;
  trend: RevenueTrendPoint[];
  byCompany: CompanyRevenueMetric[];
  productMovements: AdminRevenueAnalyticsProductMovements;
  shipping: AdminRevenueAnalyticsShipping;
}

export interface TrackPageViewInput {
  /**
     * @minLength 8
     * @maxLength 80
     */
  sessionId: string;
  /**
     * @minLength 1
     * @maxLength 500
     */
  path: string;
  /**
     * @maxLength 500
     * @nullable
     */
  referrer?: string | null;
}

export type AdminIntegrationStatus = typeof AdminIntegrationStatus[keyof typeof AdminIntegrationStatus];


export const AdminIntegrationStatus = {
  configured: 'configured',
} as const;

export interface AdminIntegration {
  providerId: string;
  status: AdminIntegrationStatus;
  /** @nullable */
  accountLabel?: string | null;
  /** @nullable */
  apiBaseUrl?: string | null;
  configuredAt: string;
  updatedAt: string;
}

export interface AdminIntegrationInput {
  /**
     * @maxLength 120
     * @nullable
     */
  accountLabel?: string | null;
  /**
     * @maxLength 500
     * @nullable
     */
  apiBaseUrl?: string | null;
}

export type DistributorContractContractType = typeof DistributorContractContractType[keyof typeof DistributorContractContractType];


export const DistributorContractContractType = {
  موزع: 'موزع',
  امتياز: 'امتياز',
  وكالة: 'وكالة',
  عقد_توريد_أجل_المملكة_العربية_السعودية: 'عقد توريد أجل المملكة العربية السعودية',
  عقد_توريد_نقد_المملكة_العربية_السعودية: 'عقد توريد نقد المملكة العربية السعودية',
  عقد_توريد_أجل_دول_الخليج: 'عقد توريد أجل دول الخليج',
  عقد_توريد_نقد_دول_الخليج: 'عقد توريد نقد دول الخليج',
} as const;

export type DistributorContractStatus = typeof DistributorContractStatus[keyof typeof DistributorContractStatus];


export const DistributorContractStatus = {
  draft: 'draft',
  seller_signed: 'seller_signed',
  sent: 'sent',
  final: 'final',
  cancelled: 'cancelled',
} as const;

export interface DistributorContract {
  id: number;
  contractNumber: string;
  /** @nullable */
  distributorId?: number | null;
  contractType: DistributorContractContractType;
  status: DistributorContractStatus;
  /** @nullable */
  contractDate?: string | null;
  templateVersion?: number;
  /** @nullable */
  hijriDateStr?: string | null;
  /** @nullable */
  gregorianDateStr?: string | null;
  /** @nullable */
  contractDayName?: string | null;
  sellerName: string;
  sellerCrNumber: string;
  sellerCrDate: string;
  sellerCrIssuer: string;
  sellerAddress: string;
  sellerRepName: string;
  sellerRepTitle: string;
  buyerCompanyName: string;
  /** @nullable */
  buyerCrNumber?: string | null;
  /** @nullable */
  buyerCrDate?: string | null;
  /** @nullable */
  buyerCrIssuer?: string | null;
  /** @nullable */
  buyerNeighborhood?: string | null;
  /** @nullable */
  buyerCity?: string | null;
  /** @nullable */
  buyerPoBox?: string | null;
  /** @nullable */
  buyerPostalCode?: string | null;
  /** @nullable */
  buyerRepName?: string | null;
  /** @nullable */
  buyerRepTitle?: string | null;
  /** @nullable */
  buyerEmail?: string | null;
  /** @nullable */
  buyerPhone?: string | null;
  /** @nullable */
  showroomName?: string | null;
  /** @nullable */
  showroomLocation?: string | null;
  /** @nullable */
  showroomCity?: string | null;
  marginPercent?: string;
  minOrderValue?: string;
  /** @nullable */
  startDate?: string | null;
  /** @nullable */
  endDate?: string | null;
  vatRate?: string;
  latePaymentWeeklyRate?: string;
  latePaymentCapRate?: string;
  inspectionDays?: number;
  warrantyMonths?: number;
  deliveryDays?: number;
  paymentDays?: number;
  products: unknown[];
  /** @nullable */
  notes?: string | null;
  /** @nullable */
  sellerSignaturePath?: string | null;
  /** @nullable */
  sellerSignedAt?: string | null;
  /** @nullable */
  buyerSignaturePath?: string | null;
  /** @nullable */
  buyerSignedAt?: string | null;
  /** @nullable */
  buyerSignedName?: string | null;
  createdBy: number;
  createdAt: string;
  updatedAt: string;
}

export interface DistributorContractLinkInput {
  /** @minimum 1 */
  distributorId: number;
}

export type DistributorContractInputContractType = typeof DistributorContractInputContractType[keyof typeof DistributorContractInputContractType];


export const DistributorContractInputContractType = {
  موزع: 'موزع',
  امتياز: 'امتياز',
  وكالة: 'وكالة',
  عقد_توريد_أجل_المملكة_العربية_السعودية: 'عقد توريد أجل المملكة العربية السعودية',
  عقد_توريد_نقد_المملكة_العربية_السعودية: 'عقد توريد نقد المملكة العربية السعودية',
  عقد_توريد_أجل_دول_الخليج: 'عقد توريد أجل دول الخليج',
  عقد_توريد_نقد_دول_الخليج: 'عقد توريد نقد دول الخليج',
} as const;

export interface DistributorContractInput {
  /** @nullable */
  contractNumber?: string | null;
  /** @nullable */
  distributorId?: number | null;
  contractType: DistributorContractInputContractType;
  /** @nullable */
  contractDate?: string | null;
  /** @nullable */
  hijriDateStr?: string | null;
  /** @nullable */
  gregorianDateStr?: string | null;
  /** @nullable */
  contractDayName?: string | null;
  /** @minLength 1 */
  sellerName: string;
  /** @minLength 1 */
  sellerCrNumber: string;
  /** @minLength 1 */
  sellerCrDate: string;
  /** @minLength 1 */
  sellerCrIssuer: string;
  /** @minLength 1 */
  sellerAddress: string;
  /** @minLength 1 */
  sellerRepName: string;
  /** @minLength 1 */
  sellerRepTitle: string;
  /** @minLength 1 */
  buyerCompanyName: string;
  /** @nullable */
  buyerCrNumber?: string | null;
  /** @nullable */
  buyerCrDate?: string | null;
  /** @nullable */
  buyerCrIssuer?: string | null;
  /** @nullable */
  buyerNeighborhood?: string | null;
  /** @nullable */
  buyerCity?: string | null;
  /** @nullable */
  buyerPoBox?: string | null;
  /** @nullable */
  buyerPostalCode?: string | null;
  /** @nullable */
  buyerRepName?: string | null;
  /** @nullable */
  buyerRepTitle?: string | null;
  /** @nullable */
  buyerEmail?: string | null;
  /** @nullable */
  buyerPhone?: string | null;
  /** @nullable */
  showroomName?: string | null;
  /** @nullable */
  showroomLocation?: string | null;
  /** @nullable */
  showroomCity?: string | null;
  marginPercent?: string;
  minOrderValue?: string;
  /** @nullable */
  startDate?: string | null;
  /** @nullable */
  endDate?: string | null;
  vatRate?: string;
  latePaymentWeeklyRate?: string;
  latePaymentCapRate?: string;
  inspectionDays?: number;
  warrantyMonths?: number;
  deliveryDays?: number;
  paymentDays?: number;
  products?: unknown[];
  /** @nullable */
  notes?: string | null;
}

export type ContractPreviewSectionsItem = {
  heading: string;
  paragraphs: string[];
};

export type ContractPreviewProductsItem = {
  barcode: string;
  description: string;
  price: string;
  priceWithVat: string;
};

export interface ContractPreview {
  title: string;
  missing: string[];
  sections: ContractPreviewSectionsItem[];
  products: ContractPreviewProductsItem[];
}

export type DistributorContractUpdate = DistributorContractInput;

export interface ContractSignatureInput {
  /** @minLength 1 */
  signaturePath: string;
}

export type ContractSignatureUploadInputContentType = typeof ContractSignatureUploadInputContentType[keyof typeof ContractSignatureUploadInputContentType];


export const ContractSignatureUploadInputContentType = {
  'image/png': 'image/png',
  'image/jpeg': 'image/jpeg',
  'image/webp': 'image/webp',
} as const;

export interface ContractSignatureUploadInput {
  /**
     * @minLength 1
     * @maxLength 255
     */
  name: string;
  /**
     * @minimum 1
     * @maximum 2097152
     */
  size: number;
  contentType: ContractSignatureUploadInputContentType;
}

export interface ContractSignatureUpload {
  uploadUrl: string;
  objectPath: string;
}

export interface PublicContractSignatureInput {
  /** @minLength 1 */
  signaturePath: string;
  /** @minLength 1 */
  buyerSignedName: string;
}

export interface ContractSendResponse {
  contract: DistributorContract;
  signingToken: string;
  signingUrl: string;
}

export interface SiteContent {
  id: number;
  key: string;
  data: unknown;
  updatedAt: string;
  /** @nullable */
  updatedBy?: string | null;
}

export type SiteContentUpsertItemsItem = {
  /** @minLength 1 */
  key: string;
  data: unknown;
};

export interface SiteContentUpsert {
  items: SiteContentUpsertItemsItem[];
}

export interface DistributorCatalogSetting {
  id: number;
  nameAr: string;
  nameEn: string;
  showOnDistributors: boolean;
  /** @nullable */
  distributorNameOverride?: string | null;
  /** @nullable */
  distributorImageOverride?: string | null;
}

export interface DistributorCatalogUpdate {
  productId: number;
  showOnDistributors: boolean;
  /** @nullable */
  distributorNameOverride?: string | null;
  /** @nullable */
  distributorImageOverride?: string | null;
}

export type AdminProductOperationalType = typeof AdminProductOperationalType[keyof typeof AdminProductOperationalType];


export const AdminProductOperationalType = {
  finished_good: 'finished_good',
  raw_material: 'raw_material',
  packaging: 'packaging',
} as const;

export interface AdminProductImage {
  url: string;
  alt: string;
}

export interface AdminProduct {
  id: number;
  nameAr: string;
  nameEn: string;
  displayNameAr: string;
  displayNameEn: string;
  invoiceNameAr: string;
  invoiceNameEn: string;
  descriptionAr?: string;
  descriptionEn?: string;
  descriptionRichAr: RichDescription | null;
  descriptionRichEn: RichDescription | null;
  slug: string;
  price: number;
  /** @nullable */
  compareAtPrice?: number | null;
  /** @minimum 0 */
  weightKg: number;
  /** @minimum 0 */
  costPrice: number;
  /**
     * @minimum 0
     * @nullable
     */
  discountPrice: number | null;
  /**
     * @nullable
     * @pattern ^\d{4}-\d{2}-\d{2}$
     */
  discountEndsOn: string | null;
  /**
     * @maxLength 100
     * @nullable
     */
  mpn: string | null;
  /**
     * @maxLength 100
     * @nullable
     */
  brand: string | null;
  /**
     * @maxLength 35
     * @nullable
     */
  subtitleAr: string | null;
  /**
     * @maxLength 25
     * @nullable
     */
  promotionalTitleAr: string | null;
  /**
     * @minimum 1
     * @nullable
     */
  maxPerCustomer: number | null;
  requiresShipping: boolean;
  allowOrderAttachment: boolean;
  allowCustomerNote: boolean;
  taxable: boolean;
  /**
     * @maxLength 100
     * @nullable
     */
  registrationNumber: string | null;
  /**
     * @maxItems 50
     * @items.minLength 1
     * @items.maxLength 50
     */
  tags: string[];
  /**
     * @maxLength 255
     * @nullable
     */
  seoTitleAr: string | null;
  /**
     * @maxLength 500
     * @nullable
     */
  seoDescriptionAr: string | null;
  categoryId: number;
  images: AdminProductImage[];
  notes: FragranceNote[];
  stockQuantity: number;
  reorderPoint: number;
  targetStockQuantity: number;
  /** @nullable */
  sku: string | null;
  /**
     * @maxLength 100
     * @nullable
     */
  barcode: string | null;
  inventoryNotes: string;
  operationalType: AdminProductOperationalType;
  unitOfMeasure: string;
  averageCost: string;
  sellable: boolean;
  isActive: boolean;
  isFeatured: boolean;
  isBestseller: boolean;
  showOnDistributors: boolean;
  /** @nullable */
  distributorNameOverride?: string | null;
  /** @nullable */
  distributorImageOverride?: string | null;
  createdAt: string;
  updatedAt: string;
}

export type AdminProductImageUploadInputContentType = typeof AdminProductImageUploadInputContentType[keyof typeof AdminProductImageUploadInputContentType];


export const AdminProductImageUploadInputContentType = {
  'image/jpeg': 'image/jpeg',
  'image/png': 'image/png',
  'image/webp': 'image/webp',
  'image/avif': 'image/avif',
  'image/gif': 'image/gif',
} as const;

export interface AdminProductImageUploadInput {
  /**
     * @minLength 1
     * @maxLength 255
     */
  name: string;
  /**
     * @minimum 1
     * @maximum 8388608
     */
  size: number;
  contentType: AdminProductImageUploadInputContentType;
}

export interface AdminProductImageUpload {
  uploadUrl: string;
  objectPath: string;
  imageUrl: string;
}

export type AdminProductInputOperationalType = typeof AdminProductInputOperationalType[keyof typeof AdminProductInputOperationalType];


export const AdminProductInputOperationalType = {
  finished_good: 'finished_good',
  raw_material: 'raw_material',
  packaging: 'packaging',
} as const;

export interface AdminProductInput {
  /** @minLength 1 */
  nameAr: string;
  /** @minLength 1 */
  nameEn: string;
  /** @minLength 1 */
  displayNameAr: string;
  /** @minLength 1 */
  displayNameEn: string;
  /** @minLength 1 */
  invoiceNameAr: string;
  /** @minLength 1 */
  invoiceNameEn: string;
  descriptionAr?: string;
  descriptionEn?: string;
  descriptionRichAr?: RichDescription | null;
  descriptionRichEn?: RichDescription | null;
  /** @minLength 1 */
  slug: string;
  /** @minimum 0 */
  price: number;
  /** @nullable */
  compareAtPrice?: number | null;
  /** @minimum 0 */
  weightKg?: number;
  /** @minimum 0 */
  costPrice?: number;
  /**
     * @minimum 0
     * @nullable
     */
  discountPrice?: number | null;
  /**
     * @nullable
     * @pattern ^\d{4}-\d{2}-\d{2}$
     */
  discountEndsOn?: string | null;
  /**
     * @maxLength 100
     * @nullable
     */
  mpn?: string | null;
  /**
     * @maxLength 100
     * @nullable
     */
  brand?: string | null;
  /**
     * @maxLength 35
     * @nullable
     */
  subtitleAr?: string | null;
  /**
     * @maxLength 25
     * @nullable
     */
  promotionalTitleAr?: string | null;
  /**
     * @minimum 1
     * @nullable
     */
  maxPerCustomer?: number | null;
  requiresShipping?: boolean;
  allowOrderAttachment?: boolean;
  allowCustomerNote?: boolean;
  taxable?: boolean;
  /**
     * @maxLength 100
     * @nullable
     */
  registrationNumber?: string | null;
  /**
     * @maxItems 50
     * @items.minLength 1
     * @items.maxLength 50
     */
  tags?: string[];
  /**
     * @maxLength 255
     * @nullable
     */
  seoTitleAr?: string | null;
  /**
     * @maxLength 500
     * @nullable
     */
  seoDescriptionAr?: string | null;
  categoryId: number;
  images?: AdminProductImage[];
  notes?: FragranceNote[];
  /** @minimum 0 */
  stockQuantity?: number;
  /** @minimum 0 */
  reorderPoint?: number;
  /** @minimum 0 */
  targetStockQuantity?: number;
  /** @nullable */
  sku?: string | null;
  /**
     * @maxLength 100
     * @nullable
     */
  barcode?: string | null;
  /** @maxLength 2000 */
  inventoryNotes?: string;
  operationalType?: AdminProductInputOperationalType;
  /** @minLength 1 */
  unitOfMeasure?: string;
  isActive?: boolean;
  isFeatured?: boolean;
  isBestseller?: boolean;
  sellable?: boolean;
  showOnDistributors?: boolean;
  /** @nullable */
  distributorNameOverride?: string | null;
  /** @nullable */
  distributorImageOverride?: string | null;
}

export interface AdminProductUpdate {
  /** @minLength 1 */
  nameAr?: string;
  /** @minLength 1 */
  nameEn?: string;
  /** @minLength 1 */
  displayNameAr?: string;
  /** @minLength 1 */
  displayNameEn?: string;
  /** @minLength 1 */
  invoiceNameAr?: string;
  /** @minLength 1 */
  invoiceNameEn?: string;
  descriptionAr?: string;
  descriptionEn?: string;
  descriptionRichAr?: RichDescription | null;
  descriptionRichEn?: RichDescription | null;
  /** @minLength 1 */
  slug?: string;
  /** @minimum 0 */
  price?: number;
  /**
     * @minimum 0
     * @nullable
     */
  compareAtPrice?: number | null;
  categoryId?: number;
  /** @minimum 0 */
  reorderPoint?: number;
  /** @minimum 0 */
  targetStockQuantity?: number;
  /** @nullable */
  sku?: string | null;
  /**
     * @maxLength 100
     * @nullable
     */
  barcode?: string | null;
  isActive?: boolean;
  isFeatured?: boolean;
  isBestseller?: boolean;
  sellable?: boolean;
  showOnDistributors?: boolean;
  /** @nullable */
  distributorNameOverride?: string | null;
  /** @nullable */
  distributorImageOverride?: string | null;
  images?: AdminProductImage[];
  notes?: FragranceNote[];
  /** @minimum 0 */
  weightKg?: number;
  /** @minimum 0 */
  costPrice?: number;
  /**
     * @minimum 0
     * @nullable
     */
  discountPrice?: number | null;
  /**
     * @nullable
     * @pattern ^\d{4}-\d{2}-\d{2}$
     */
  discountEndsOn?: string | null;
  /**
     * @maxLength 100
     * @nullable
     */
  mpn?: string | null;
  /**
     * @maxLength 100
     * @nullable
     */
  brand?: string | null;
  /**
     * @maxLength 35
     * @nullable
     */
  subtitleAr?: string | null;
  /**
     * @maxLength 25
     * @nullable
     */
  promotionalTitleAr?: string | null;
  /**
     * @minimum 1
     * @nullable
     */
  maxPerCustomer?: number | null;
  requiresShipping?: boolean;
  allowOrderAttachment?: boolean;
  allowCustomerNote?: boolean;
  taxable?: boolean;
  /**
     * @maxLength 100
     * @nullable
     */
  registrationNumber?: string | null;
  /**
     * @maxItems 50
     * @items.minLength 1
     * @items.maxLength 50
     */
  tags?: string[];
  /**
     * @maxLength 255
     * @nullable
     */
  seoTitleAr?: string | null;
  /**
     * @maxLength 500
     * @nullable
     */
  seoDescriptionAr?: string | null;
}

export interface AdminCategory {
  id: number;
  nameAr: string;
  nameEn: string;
  slug: string;
  /** @nullable */
  parentId?: number | null;
  /** @nullable */
  imageUrl?: string | null;
  isActive: boolean;
  createdAt: string;
}

export interface AdminCategoryInput {
  /** @minLength 1 */
  nameAr: string;
  /** @minLength 1 */
  nameEn: string;
  /** @minLength 1 */
  slug: string;
  /** @nullable */
  parentId?: number | null;
  /** @nullable */
  imageUrl?: string | null;
  isActive?: boolean;
}

export interface AdminCategoryUpdate {
  /** @minLength 1 */
  nameAr?: string;
  /** @minLength 1 */
  nameEn?: string;
  /** @minLength 1 */
  slug?: string;
  /** @nullable */
  parentId?: number | null;
  /** @nullable */
  imageUrl?: string | null;
  isActive?: boolean;
}

export type AdminOrderStatus = typeof AdminOrderStatus[keyof typeof AdminOrderStatus];


export const AdminOrderStatus = {
  cancelled: 'cancelled',
  returned: 'returned',
  pending_review: 'pending_review',
  preparing: 'preparing',
  out_for_delivery: 'out_for_delivery',
  delivered: 'delivered',
  pending_payment: 'pending_payment',
} as const;

export type AdminOrderPaymentStatus = typeof AdminOrderPaymentStatus[keyof typeof AdminOrderPaymentStatus];


export const AdminOrderPaymentStatus = {
  pending: 'pending',
  paid: 'paid',
  failed: 'failed',
  refunded: 'refunded',
} as const;

export type AdminOrderPaymentLink = {
  sent: boolean;
  status: string;
  expiresAt: string;
};

export interface AdminOrder {
  id: number;
  userId: number;
  customerName: string;
  orderNumber: string;
  subtotal: number;
  shippingCost: number;
  discount: number;
  tax: number;
  total: number;
  status: AdminOrderStatus;
  paymentStatus: AdminOrderPaymentStatus;
  /** @nullable */
  trackingNumber?: string | null;
  address?: string;
  shippingMethod: string;
  paymentMethod: string;
  /** @nullable */
  adminNotes?: string | null;
  paymentLink?: AdminOrderPaymentLink;
  createdAt: string;
  updatedAt: string;
}

export type AdminOrderUpdateStatus = typeof AdminOrderUpdateStatus[keyof typeof AdminOrderUpdateStatus];


export const AdminOrderUpdateStatus = {
  cancelled: 'cancelled',
  returned: 'returned',
  pending_review: 'pending_review',
  preparing: 'preparing',
  out_for_delivery: 'out_for_delivery',
  delivered: 'delivered',
  pending_payment: 'pending_payment',
} as const;

export type AdminOrderUpdatePaymentStatus = typeof AdminOrderUpdatePaymentStatus[keyof typeof AdminOrderUpdatePaymentStatus];


export const AdminOrderUpdatePaymentStatus = {
  pending: 'pending',
  paid: 'paid',
  failed: 'failed',
  refunded: 'refunded',
} as const;

export interface AdminOrderUpdate {
  status?: AdminOrderUpdateStatus;
  paymentStatus?: AdminOrderUpdatePaymentStatus;
  /** @nullable */
  trackingNumber?: string | null;
  /** @nullable */
  adminNotes?: string | null;
}

export interface AdminOrderLineInput {
  /** @minimum 1 */
  productId: number;
  /** @minimum 1 */
  quantity: number;
}

export type AdminOrderInputPaymentMethod = typeof AdminOrderInputPaymentMethod[keyof typeof AdminOrderInputPaymentMethod];


export const AdminOrderInputPaymentMethod = {
  cash: 'cash',
  'bank-transfer': 'bank-transfer',
  moyasar: 'moyasar',
} as const;

export interface AdminOrderAddress {
  label: string;
  city: string;
  /** @nullable */
  country?: string | null;
  /** @nullable */
  nationalAddressShortCode?: string | null;
  /** @nullable */
  postalCode?: string | null;
  /** @nullable */
  additionalNumber?: string | null;
  district: string;
  street: string;
  buildingNo: string;
  /** @nullable */
  additionalInfo: string | null;
  isDefault: boolean;
}

export interface AdminOrderInput {
  /** @minimum 1 */
  userId: number;
  /** @minItems 1 */
  items: AdminOrderLineInput[];
  orderAddress: AdminOrderAddress;
  /** @minLength 1 */
  shippingMethod: string;
  paymentMethod: AdminOrderInputPaymentMethod;
  /** @minimum 0 */
  shippingCost?: number;
  /** @nullable */
  adminNotes?: string | null;
  sendPaymentLink?: boolean;
}

export interface AdminOrderPaymentLinkResponse {
  sent: boolean;
  expiresAt: string;
  status: string;
}

export interface MoyasarCallbackInput {
  /** @minLength 1 */
  id: string;
}

export interface MoyasarCallbackResult {
  accepted: boolean;
  duplicate: boolean;
}

export type AdminInvoiceHistorical = typeof AdminInvoiceHistorical[keyof typeof AdminInvoiceHistorical];


export const AdminInvoiceHistorical = {
  yes: 'yes',
  no: 'no',
} as const;

/**
 * @nullable
 */
export type AdminInvoicePaymentTerm = typeof AdminInvoicePaymentTerm[keyof typeof AdminInvoicePaymentTerm] | null;


export const AdminInvoicePaymentTerm = {
  net_days: 'net_days',
  end_of_month: 'end_of_month',
  due_on_issue: 'due_on_issue',
} as const;

/**
 * @nullable
 */
export type AdminInvoiceTaxTreatment = typeof AdminInvoiceTaxTreatment[keyof typeof AdminInvoiceTaxTreatment] | null;


export const AdminInvoiceTaxTreatment = {
  domestic: 'domestic',
  international: 'international',
} as const;

export type AdminInvoicePaymentStatus = typeof AdminInvoicePaymentStatus[keyof typeof AdminInvoicePaymentStatus];


export const AdminInvoicePaymentStatus = {
  unpaid: 'unpaid',
  partial: 'partial',
  paid: 'paid',
} as const;

export type ReceivablePaymentPaymentMethod = typeof ReceivablePaymentPaymentMethod[keyof typeof ReceivablePaymentPaymentMethod];


export const ReceivablePaymentPaymentMethod = {
  cash: 'cash',
  bank_transfer: 'bank_transfer',
} as const;

export interface ReceivablePayment {
  id: number;
  invoiceId: number;
  paymentDate: string;
  amount: number;
  paymentMethod: ReceivablePaymentPaymentMethod;
  /** @nullable */
  reference: string | null;
  createdBy: number;
  createdAt: string;
}

export interface AdminInvoiceItem {
  id: number;
  /** @nullable */
  productId: number | null;
  productName: string;
  /** @nullable */
  productNameEn: string | null;
  /** @nullable */
  sku: string | null;
  quantity: number;
  unitPrice: number;
  subtotal: number;
  vatAmount: number;
  totalAmount: number;
}

export interface AdminInvoice {
  id: number;
  historical: AdminInvoiceHistorical;
  /** @nullable */
  orderId: number | null;
  /** @nullable */
  orderNumber: string | null;
  /** @nullable */
  distributorId: number | null;
  /** @nullable */
  distributorName: string | null;
  /** @nullable */
  contractId: number | null;
  /** @nullable */
  uploadedContractFileId: number | null;
  /** @nullable */
  contractNumber: string | null;
  /** @nullable */
  contractType: string | null;
  /** @nullable */
  contractDiscountPercent: number | null;
  /** @nullable */
  paymentDays: number | null;
  /** @nullable */
  paymentTerm: AdminInvoicePaymentTerm;
  /** @nullable */
  taxTreatment: AdminInvoiceTaxTreatment;
  /** @nullable */
  vatRate: number | null;
  /** @nullable */
  exhibitionId: number | null;
  /** @nullable */
  exhibitionName: string | null;
  sequenceNumber: number;
  invoiceNumber: string;
  sellerName: string;
  issueDatetime: string;
  /** @nullable */
  dueDate: string | null;
  sellerVatNumber: string;
  /** @nullable */
  buyerName: string | null;
  /** @nullable */
  buyerTaxNumber: string | null;
  /** @nullable */
  buyerCommercialRegistrationNumber: string | null;
  /** @nullable */
  buyerAddress: string | null;
  subtotal: number;
  discountAmount: number;
  shippingAmount?: number;
  vatAmount: number;
  totalAmount: number;
  paidAmount: number;
  outstandingAmount: number;
  paymentStatus: AdminInvoicePaymentStatus;
  payments: ReceivablePayment[];
  qrCodeData: string;
  items: AdminInvoiceItem[];
  createdAt: string;
}

export interface HistoricalInvoiceReview {
  conflicts: string[];
  warnings: string[];
}

export interface HistoricalInvoiceCreated {
  id: number;
  invoiceNumber: string;
}

export interface HistoricalCompanyLineInput {
  /**
     * @minLength 1
     * @maxLength 200
     */
  productName: string;
  /** @nullable */
  sku?: string | null;
  /** @minimum 1 */
  quantity: number;
  /** @minimum 0 */
  unitPrice: number;
  /** @minimum 0 */
  subtotal: number;
  /** @minimum 0 */
  vatAmount: number;
  /** @minimum 0 */
  totalAmount: number;
}

export type HistoricalCompanyPaymentInputPaymentMethod = typeof HistoricalCompanyPaymentInputPaymentMethod[keyof typeof HistoricalCompanyPaymentInputPaymentMethod];


export const HistoricalCompanyPaymentInputPaymentMethod = {
  cash: 'cash',
  bank_transfer: 'bank_transfer',
} as const;

export interface HistoricalCompanyPaymentInput {
  /**
     * @minLength 16
     * @maxLength 100
     */
  paymentKey: string;
  paymentDate: string;
  /** @exclusiveMinimum 0 */
  amount: number;
  paymentMethod: HistoricalCompanyPaymentInputPaymentMethod;
  /**
     * @maxLength 200
     * @nullable
     */
  reference?: string | null;
}

export type HistoricalCompanyInvoiceInputTaxTreatment = typeof HistoricalCompanyInvoiceInputTaxTreatment[keyof typeof HistoricalCompanyInvoiceInputTaxTreatment];


export const HistoricalCompanyInvoiceInputTaxTreatment = {
  domestic: 'domestic',
  international: 'international',
} as const;

export interface HistoricalCompanyInvoiceInput {
  /**
     * @minLength 16
     * @maxLength 100
     */
  creationKey: string;
  /** @minimum 1 */
  distributorId: number;
  /**
     * @minLength 1
     * @maxLength 100
     */
  invoiceNumber: string;
  issueDate: string;
  dueDate: string;
  /** @minLength 1 */
  buyerName: string;
  /** @nullable */
  buyerTaxNumber?: string | null;
  /** @nullable */
  buyerAddress?: string | null;
  /** @nullable */
  buyerCommercialRegistrationNumber?: string | null;
  /** @minLength 1 */
  sellerName: string;
  /** @minLength 1 */
  sellerVatNumber: string;
  taxTreatment: HistoricalCompanyInvoiceInputTaxTreatment;
  /** @minimum 0 */
  subtotal: number;
  /** @minimum 0 */
  discountAmount: number;
  /** @minimum 0 */
  vatAmount: number;
  /** @exclusiveMinimum 0 */
  totalAmount: number;
  /**
     * @minItems 1
     * @maxItems 100
     */
  items: HistoricalCompanyLineInput[];
  payments: HistoricalCompanyPaymentInput[];
}

export interface DistributorInvoiceLineInput {
  /** @minimum 1 */
  productId: number;
  /** @minimum 1 */
  quantity: number;
  /** @exclusiveMinimum 0 */
  unitPrice: number;
}

export type DistributorInvoiceInputTaxTreatment = typeof DistributorInvoiceInputTaxTreatment[keyof typeof DistributorInvoiceInputTaxTreatment];


export const DistributorInvoiceInputTaxTreatment = {
  domestic: 'domestic',
  international: 'international',
} as const;

export interface DistributorInvoiceInput {
  /**
     * @minLength 16
     * @maxLength 100
     */
  creationKey: string;
  /** @minimum 1 */
  distributorId: number;
  /** @minimum 1 */
  contractId?: number;
  /** @minimum 1 */
  uploadedContractFileId?: number;
  taxTreatment?: DistributorInvoiceInputTaxTreatment;
  dueDate?: string;
  /**
     * @minItems 1
     * @maxItems 100
     */
  items: DistributorInvoiceLineInput[];
}

export type ExhibitionInvoiceInputPaymentMethod = typeof ExhibitionInvoiceInputPaymentMethod[keyof typeof ExhibitionInvoiceInputPaymentMethod];


export const ExhibitionInvoiceInputPaymentMethod = {
  cash: 'cash',
  bank_transfer: 'bank_transfer',
} as const;

export interface ExhibitionInvoiceInput {
  /**
     * @minLength 16
     * @maxLength 100
     */
  creationKey: string;
  /** @minimum 1 */
  exhibitionId: number;
  saleDate: string;
  /**
     * @minLength 1
     * @maxLength 200
     */
  buyerName: string;
  /**
     * @maxLength 500
     * @nullable
     */
  buyerAddress?: string | null;
  /**
     * @maxLength 30
     * @nullable
     */
  buyerTaxNumber?: string | null;
  /**
     * @maxLength 30
     * @nullable
     */
  buyerCommercialRegistrationNumber?: string | null;
  paymentMethod: ExhibitionInvoiceInputPaymentMethod;
  /**
     * @minItems 1
     * @maxItems 100
     */
  items: DistributorInvoiceLineInput[];
}

export interface AdminInvoiceUpdate {
  /** @nullable */
  dueDate?: string | null;
  /**
     * @maxLength 200
     * @nullable
     */
  buyerName?: string | null;
  /**
     * @maxLength 30
     * @nullable
     */
  buyerTaxNumber?: string | null;
  /**
     * @maxLength 30
     * @nullable
     */
  buyerCommercialRegistrationNumber?: string | null;
  /**
     * @maxLength 500
     * @nullable
     */
  buyerAddress?: string | null;
}

export type InvoiceEmailInputLanguage = typeof InvoiceEmailInputLanguage[keyof typeof InvoiceEmailInputLanguage];


export const InvoiceEmailInputLanguage = {
  ar: 'ar',
  en: 'en',
} as const;

export interface InvoiceEmailInput {
  /**
     * @maxLength 320
     * @pattern ^[^\s@]+@[^\s@]+\.[^\s@]+$
     */
  recipient: string;
  language?: InvoiceEmailInputLanguage;
}

export type InvoiceEmailDeliveryStatus = typeof InvoiceEmailDeliveryStatus[keyof typeof InvoiceEmailDeliveryStatus];


export const InvoiceEmailDeliveryStatus = {
  sent: 'sent',
  failed: 'failed',
} as const;

export interface InvoiceEmailDelivery {
  id: number;
  invoiceId: number;
  recipient: string;
  status: InvoiceEmailDeliveryStatus;
  /** @nullable */
  errorMessage: string | null;
  sentByAdminId: number;
  sentByName: string;
  attemptedAt: string;
}

export type ContractFileUploadRequestMimeType = typeof ContractFileUploadRequestMimeType[keyof typeof ContractFileUploadRequestMimeType];


export const ContractFileUploadRequestMimeType = {
  'application/pdf': 'application/pdf',
  'application/msword': 'application/msword',
  'application/vndopenxmlformats-officedocumentwordprocessingmldocument': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
} as const;

export interface ContractFileUploadRequest {
  /**
     * @minLength 1
     * @maxLength 255
     */
  fileName: string;
  mimeType: ContractFileUploadRequestMimeType;
  /**
     * @minimum 1
     * @maximum 26214400
     */
  sizeBytes: number;
}

export type UploadedContractFileInputOwnerType = typeof UploadedContractFileInputOwnerType[keyof typeof UploadedContractFileInputOwnerType];


export const UploadedContractFileInputOwnerType = {
  distributor: 'distributor',
  customer: 'customer',
  influencer: 'influencer',
  employee: 'employee',
} as const;

export type UploadedContractFileInputMimeType = typeof UploadedContractFileInputMimeType[keyof typeof UploadedContractFileInputMimeType];


export const UploadedContractFileInputMimeType = {
  'application/pdf': 'application/pdf',
  'application/msword': 'application/msword',
  'application/vndopenxmlformats-officedocumentwordprocessingmldocument': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
} as const;

export interface UploadedContractFileInput {
  ownerType: UploadedContractFileInputOwnerType;
  /** @minimum 1 */
  ownerId: number;
  /**
     * @minLength 1
     * @maxLength 255
     */
  fileName: string;
  /** @pattern ^/objects/(?:uploads/contracts/files|local/contracts)/[A-Za-z0-9-]+$ */
  objectPath: string;
  mimeType: UploadedContractFileInputMimeType;
  /**
     * @minimum 1
     * @maximum 26214400
     */
  sizeBytes: number;
  /**
     * @maxLength 1000
     * @nullable
     */
  notes?: string | null;
}

export type UploadedContractFileOwnerType = typeof UploadedContractFileOwnerType[keyof typeof UploadedContractFileOwnerType];


export const UploadedContractFileOwnerType = {
  distributor: 'distributor',
  customer: 'customer',
  influencer: 'influencer',
  employee: 'employee',
} as const;

/**
 * @nullable
 */
export type UploadedContractFilePaymentTerm = typeof UploadedContractFilePaymentTerm[keyof typeof UploadedContractFilePaymentTerm] | null;


export const UploadedContractFilePaymentTerm = {
  net_days: 'net_days',
  end_of_month: 'end_of_month',
  due_on_issue: 'due_on_issue',
} as const;

export interface UploadedContractFile {
  id: number;
  ownerType: UploadedContractFileOwnerType;
  ownerId: number;
  ownerName: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  /** @nullable */
  notes: string | null;
  /** @nullable */
  contractType: string | null;
  /** @nullable */
  discountPercent: number | null;
  /** @nullable */
  paymentTerm: UploadedContractFilePaymentTerm;
  /** @nullable */
  paymentDays: number | null;
  /** @nullable */
  startDate: string | null;
  /** @nullable */
  endDate: string | null;
  /** @nullable */
  signedDate: string | null;
  /** @nullable */
  termsConfirmedAt: string | null;
  /** @nullable */
  termsConfirmedBy: number | null;
  uploadedBy: number;
  uploadedAt: string;
}

export type UploadedContractTermsInputPaymentTerm = typeof UploadedContractTermsInputPaymentTerm[keyof typeof UploadedContractTermsInputPaymentTerm];


export const UploadedContractTermsInputPaymentTerm = {
  net_days: 'net_days',
  end_of_month: 'end_of_month',
  due_on_issue: 'due_on_issue',
} as const;

export interface UploadedContractTermsInput {
  /**
     * @minLength 1
     * @maxLength 100
     */
  contractType: string;
  /**
     * @minimum 0
     * @maximum 100
     */
  discountPercent: number;
  paymentTerm: UploadedContractTermsInputPaymentTerm;
  /**
     * @minimum 1
     * @maximum 365
     */
  paymentDays?: number;
  /** @nullable */
  startDate?: string | null;
  /** @nullable */
  endDate?: string | null;
  /** @nullable */
  signedDate?: string | null;
}

export type ContractSignedDateSuggestionSource = typeof ContractSignedDateSuggestionSource[keyof typeof ContractSignedDateSuggestionSource];


export const ContractSignedDateSuggestionSource = {
  text: 'text',
  ocr: 'ocr',
  unavailable: 'unavailable',
} as const;

export interface ContractSignedDateSuggestion {
  /** @nullable */
  date: string | null;
  source: ContractSignedDateSuggestionSource;
  message: string;
}

export type ReceivablePaymentInputPaymentMethod = typeof ReceivablePaymentInputPaymentMethod[keyof typeof ReceivablePaymentInputPaymentMethod];


export const ReceivablePaymentInputPaymentMethod = {
  cash: 'cash',
  bank_transfer: 'bank_transfer',
} as const;

export interface ReceivablePaymentInput {
  /**
     * @minLength 16
     * @maxLength 100
     */
  paymentKey: string;
  paymentDate: string;
  /** @exclusiveMinimum 0 */
  amount: number;
  paymentMethod: ReceivablePaymentInputPaymentMethod;
  /**
     * @maxLength 200
     * @nullable
     */
  reference?: string | null;
}

export interface AdminOrderCustomer {
  name: string;
  phone: string;
  /** @nullable */
  email: string | null;
}

export interface AdminOrderItem {
  productId: number;
  productName: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  /** @nullable */
  imageUrl: string | null;
}

export type AdminOrderCouponDiscountType = typeof AdminOrderCouponDiscountType[keyof typeof AdminOrderCouponDiscountType];


export const AdminOrderCouponDiscountType = {
  percentage: 'percentage',
  fixed: 'fixed',
} as const;

export interface AdminOrderCoupon {
  code: string;
  discountType: AdminOrderCouponDiscountType;
  discountValue: number;
}

export type AdminOrderDetail = AdminOrder & ({
  customer: AdminOrderCustomer;
  orderAddress: AdminOrderAddress;
  items: AdminOrderItem[];
  coupon: AdminOrderCoupon | null;
});

export type ShipmentChannel = typeof ShipmentChannel[keyof typeof ShipmentChannel];


export const ShipmentChannel = {
  online: 'online',
  b2b: 'b2b',
} as const;

export type ShipmentShippingScope = typeof ShipmentShippingScope[keyof typeof ShipmentShippingScope];


export const ShipmentShippingScope = {
  domestic: 'domestic',
  international: 'international',
} as const;

export type ShipmentStatus = typeof ShipmentStatus[keyof typeof ShipmentStatus];


export const ShipmentStatus = {
  pending: 'pending',
  ready: 'ready',
  in_transit: 'in_transit',
  delivered: 'delivered',
  returned: 'returned',
  cancelled: 'cancelled',
} as const;

export type ShipmentIntegrationStatus = typeof ShipmentIntegrationStatus[keyof typeof ShipmentIntegrationStatus];


export const ShipmentIntegrationStatus = {
  not_requested: 'not_requested',
  processing: 'processing',
  active: 'active',
  failed: 'failed',
} as const;

export type ShipmentEventOutcome = typeof ShipmentEventOutcome[keyof typeof ShipmentEventOutcome];


export const ShipmentEventOutcome = {
  success: 'success',
  failed: 'failed',
  ignored: 'ignored',
} as const;

export interface ShipmentEvent {
  id: number;
  carrier: string;
  eventType: string;
  /** @nullable */
  status: string | null;
  outcome: ShipmentEventOutcome;
  /** @nullable */
  errorMessage: string | null;
  createdAt: string;
}

export interface Shipment {
  id: number;
  channel: ShipmentChannel;
  shippingScope: ShipmentShippingScope;
  /** @nullable */
  orderId: number | null;
  /** @nullable */
  invoiceId: number | null;
  referenceNumber: string;
  partyName: string;
  /** @nullable */
  companyName?: string | null;
  /** @nullable */
  recipientName?: string | null;
  /** @nullable */
  recipientPhone?: string | null;
  destinationCity: string;
  /** @nullable */
  destinationAddress: string | null;
  /** @nullable */
  nationalAddressShortCode: string | null;
  /** @nullable */
  destinationCountry: string | null;
  /** @nullable */
  destinationDistrict: string | null;
  /** @nullable */
  destinationStreet: string | null;
  /** @nullable */
  destinationBuildingNumber: string | null;
  /** @nullable */
  destinationPostalCode: string | null;
  /** @nullable */
  destinationAdditionalDetails: string | null;
  /** @nullable */
  carrier: string | null;
  /** @nullable */
  serviceMethod: string | null;
  /** @nullable */
  trackingNumber: string | null;
  /** @nullable */
  carrierShipmentId: string | null;
  /** @nullable */
  labelUrl: string | null;
  status: ShipmentStatus;
  integrationStatus: ShipmentIntegrationStatus;
  /** @nullable */
  integrationError: string | null;
  integrationAttempts: number;
  /** @nullable */
  lastIntegrationAttemptAt: string | null;
  /** @nullable */
  actualCost: number | null;
  /** @nullable */
  collectedCost: number | null;
  /** @nullable */
  shippedAt: string | null;
  /** @nullable */
  deliveredAt: string | null;
  events: ShipmentEvent[];
  createdAt: string;
  updatedAt: string;
}

export type ShipmentInputChannel = typeof ShipmentInputChannel[keyof typeof ShipmentInputChannel];


export const ShipmentInputChannel = {
  online: 'online',
  b2b: 'b2b',
} as const;

export type ShipmentInputShippingScope = typeof ShipmentInputShippingScope[keyof typeof ShipmentInputShippingScope];


export const ShipmentInputShippingScope = {
  domestic: 'domestic',
  international: 'international',
} as const;

export type ShipmentInputStatus = typeof ShipmentInputStatus[keyof typeof ShipmentInputStatus];


export const ShipmentInputStatus = {
  pending: 'pending',
  ready: 'ready',
  in_transit: 'in_transit',
  delivered: 'delivered',
  returned: 'returned',
  cancelled: 'cancelled',
} as const;

export interface ShipmentInput {
  channel: ShipmentInputChannel;
  shippingScope?: ShipmentInputShippingScope;
  sourceId: number;
  /**
     * @maxLength 200
     * @nullable
     */
  companyName?: string | null;
  /**
     * @maxLength 200
     * @nullable
     */
  recipientName?: string | null;
  /**
     * @maxLength 30
     * @nullable
     */
  recipientPhone?: string | null;
  /** @minLength 1 */
  destinationCity: string;
  /** @nullable */
  destinationAddress?: string | null;
  /**
     * @minLength 4
     * @maxLength 12
     * @nullable
     */
  nationalAddressShortCode?: string | null;
  /**
     * @maxLength 100
     * @nullable
     */
  destinationCountry?: string | null;
  /**
     * @maxLength 150
     * @nullable
     */
  destinationDistrict?: string | null;
  /**
     * @maxLength 200
     * @nullable
     */
  destinationStreet?: string | null;
  /**
     * @maxLength 20
     * @nullable
     */
  destinationBuildingNumber?: string | null;
  /**
     * @maxLength 20
     * @nullable
     */
  destinationPostalCode?: string | null;
  /**
     * @maxLength 500
     * @nullable
     */
  destinationAdditionalDetails?: string | null;
  /** @nullable */
  carrier?: string | null;
  /** @nullable */
  serviceMethod?: string | null;
  /** @nullable */
  trackingNumber?: string | null;
  status?: ShipmentInputStatus;
  /** @nullable */
  actualCost?: number | null;
  /** @nullable */
  collectedCost?: number | null;
  /** @nullable */
  shippedAt?: string | null;
  /** @nullable */
  deliveredAt?: string | null;
}

export type ShipmentUpdateShippingScope = typeof ShipmentUpdateShippingScope[keyof typeof ShipmentUpdateShippingScope];


export const ShipmentUpdateShippingScope = {
  domestic: 'domestic',
  international: 'international',
} as const;

export type ShipmentUpdateStatus = typeof ShipmentUpdateStatus[keyof typeof ShipmentUpdateStatus];


export const ShipmentUpdateStatus = {
  pending: 'pending',
  ready: 'ready',
  in_transit: 'in_transit',
  delivered: 'delivered',
  returned: 'returned',
  cancelled: 'cancelled',
} as const;

export interface ShipmentUpdate {
  /**
     * @maxLength 200
     * @nullable
     */
  companyName?: string | null;
  /**
     * @maxLength 200
     * @nullable
     */
  recipientName?: string | null;
  /**
     * @maxLength 30
     * @nullable
     */
  recipientPhone?: string | null;
  shippingScope?: ShipmentUpdateShippingScope;
  /** @minLength 1 */
  destinationCity?: string;
  /** @nullable */
  destinationAddress?: string | null;
  /**
     * @minLength 4
     * @maxLength 12
     * @nullable
     */
  nationalAddressShortCode?: string | null;
  /**
     * @maxLength 100
     * @nullable
     */
  destinationCountry?: string | null;
  /**
     * @maxLength 150
     * @nullable
     */
  destinationDistrict?: string | null;
  /**
     * @maxLength 200
     * @nullable
     */
  destinationStreet?: string | null;
  /**
     * @maxLength 20
     * @nullable
     */
  destinationBuildingNumber?: string | null;
  /**
     * @maxLength 20
     * @nullable
     */
  destinationPostalCode?: string | null;
  /**
     * @maxLength 500
     * @nullable
     */
  destinationAdditionalDetails?: string | null;
  /** @nullable */
  carrier?: string | null;
  /** @nullable */
  serviceMethod?: string | null;
  /** @nullable */
  trackingNumber?: string | null;
  status?: ShipmentUpdateStatus;
  /** @nullable */
  actualCost?: number | null;
  /** @nullable */
  collectedCost?: number | null;
  /** @nullable */
  shippedAt?: string | null;
  /** @nullable */
  deliveredAt?: string | null;
}

export type ShippingLabelInputCarrier = typeof ShippingLabelInputCarrier[keyof typeof ShippingLabelInputCarrier];


export const ShippingLabelInputCarrier = {
  smsa: 'smsa',
} as const;

export interface ShippingLabelInput {
  carrier: ShippingLabelInputCarrier;
  /**
     * @minLength 1
     * @maxLength 100
     */
  serviceMethod: string;
}

export type ShippingWebhookInputStatus = typeof ShippingWebhookInputStatus[keyof typeof ShippingWebhookInputStatus];


export const ShippingWebhookInputStatus = {
  created: 'created',
  picked_up: 'picked_up',
  in_transit: 'in_transit',
  delivered: 'delivered',
  returned: 'returned',
  cancelled: 'cancelled',
} as const;

export interface ShippingWebhookInput {
  /**
     * @minLength 1
     * @maxLength 200
     */
  eventId: string;
  /**
     * @minLength 1
     * @maxLength 200
     */
  trackingNumber: string;
  status: ShippingWebhookInputStatus;
  /** @nullable */
  occurredAt?: string | null;
  /**
     * @minimum 0
     * @nullable
     */
  actualCost?: number | null;
}

export interface ShippingWebhookResult {
  accepted: boolean;
  duplicate: boolean;
}

export interface ShippingMetric {
  key: string;
  labelAr: string;
  labelEn: string;
  count: number;
}

export interface ShippingTrendPoint {
  date: string;
  shipments: number;
  actualCost: number;
}

export interface ShippingSummary {
  shipmentCount: number;
  uniqueParties: number;
  totalActualCost: number;
  averageActualCost: number;
  totalCollectedCost: number;
}

export type ShippingDashboardChannel = typeof ShippingDashboardChannel[keyof typeof ShippingDashboardChannel];


export const ShippingDashboardChannel = {
  online: 'online',
  b2b: 'b2b',
} as const;

export interface ShippingDashboard {
  channel: ShippingDashboardChannel;
  summary: ShippingSummary;
  trend: ShippingTrendPoint[];
  statuses: ShippingMetric[];
  destinations: ShippingMetric[];
  cities: string[];
  items: Shipment[];
  total: number;
  page: number;
  pageSize: number;
}

export type AdminCouponDiscountType = typeof AdminCouponDiscountType[keyof typeof AdminCouponDiscountType];


export const AdminCouponDiscountType = {
  percentage: 'percentage',
  fixed: 'fixed',
} as const;

export interface AdminCoupon {
  id: number;
  code: string;
  discountType: AdminCouponDiscountType;
  discountValue: number;
  /** @nullable */
  expiresAt?: string | null;
  /** @nullable */
  usageLimit?: number | null;
  timesUsed: number;
  isActive: boolean;
  createdAt: string;
}

export type AdminCouponInputDiscountType = typeof AdminCouponInputDiscountType[keyof typeof AdminCouponInputDiscountType];


export const AdminCouponInputDiscountType = {
  percentage: 'percentage',
  fixed: 'fixed',
} as const;

export interface AdminCouponInput {
  /** @minLength 1 */
  code: string;
  discountType: AdminCouponInputDiscountType;
  /** @minimum 0 */
  discountValue: number;
  /** @nullable */
  expiresAt?: string | null;
  /**
     * @minimum 1
     * @nullable
     */
  usageLimit?: number | null;
  isActive?: boolean;
}

export type AdminCouponUpdate = AdminCouponInput;

export interface AdminCouponDisableInput {
  /** Explicitly confirm disabling a coupon used by active campaigns */
  confirm: boolean;
}

export interface AdminCampaignCoupon {
  id: number;
  code: string;
}

export interface CouponAffectedCampaign {
  id: number;
  name: string;
}

export interface CouponDisableConflict {
  error: string;
  /** @minItems 1 */
  affectedCampaigns: CouponAffectedCampaign[];
}

export type AdminCampaignStatus = typeof AdminCampaignStatus[keyof typeof AdminCampaignStatus];


export const AdminCampaignStatus = {
  draft: 'draft',
  active: 'active',
  paused: 'paused',
} as const;

export interface AdminCampaign {
  id: number;
  name: string;
  channel: string;
  status: AdminCampaignStatus;
  startsAt: string;
  endsAt: string;
  coupons: AdminCampaignCoupon[];
  createdAt: string;
  updatedAt: string;
}

export interface AdminCampaignCouponResult {
  id: number;
  code: string;
  uses: number;
  orders: number;
  revenue: number;
}

export type AdminCampaignResultStatus = typeof AdminCampaignResultStatus[keyof typeof AdminCampaignResultStatus];


export const AdminCampaignResultStatus = {
  draft: 'draft',
  active: 'active',
  paused: 'paused',
} as const;

export interface AdminCampaignResult {
  id: number;
  name: string;
  channel: string;
  status: AdminCampaignResultStatus;
  startsAt: string;
  endsAt: string;
  couponUses: number;
  orders: number;
  revenue: number;
  coupons: AdminCampaignCouponResult[];
}

export interface AdminCampaignChannelResult {
  channel: string;
  campaigns: number;
  couponUses: number;
  orders: number;
  revenue: number;
}

export interface AdminCampaignResults {
  couponUses: number;
  orders: number;
  revenue: number;
  byChannel: AdminCampaignChannelResult[];
  campaigns: AdminCampaignResult[];
}

export type AdminSocialPlatform = typeof AdminSocialPlatform[keyof typeof AdminSocialPlatform];


export const AdminSocialPlatform = {
  instagram: 'instagram',
  facebook: 'facebook',
  tiktok: 'tiktok',
  x: 'x',
  linkedin: 'linkedin',
} as const;

export type AdminSocialPostStatus = typeof AdminSocialPostStatus[keyof typeof AdminSocialPostStatus];


export const AdminSocialPostStatus = {
  draft: 'draft',
  scheduled: 'scheduled',
  published_manual: 'published_manual',
} as const;

export interface AdminSocialPost {
  id: number;
  title: string;
  caption: string;
  platforms: AdminSocialPlatform[];
  mediaUrls: string[];
  status: AdminSocialPostStatus;
  /** @nullable */
  scheduledAt: string | null;
  /** @nullable */
  publishedAt: string | null;
  /** @nullable */
  campaignId: number | null;
  createdAt: string;
  updatedAt: string;
}

export type AdminSocialPostInputStatus = typeof AdminSocialPostInputStatus[keyof typeof AdminSocialPostInputStatus];


export const AdminSocialPostInputStatus = {
  draft: 'draft',
  scheduled: 'scheduled',
} as const;

export interface AdminSocialPostInput {
  /**
     * @minLength 1
     * @maxLength 120
     */
  title: string;
  /**
     * @minLength 1
     * @maxLength 5000
     */
  caption: string;
  /**
     * @minItems 1
     * @maxItems 5
     */
  platforms: AdminSocialPlatform[];
  /**
     * @maxItems 6
     * @items.maxLength 400
     */
  mediaUrls: string[];
  status: AdminSocialPostInputStatus;
  /** @nullable */
  scheduledAt?: string | null;
  /** @nullable */
  campaignId?: number | null;
}

export type AdminSocialPostUpdateStatus = typeof AdminSocialPostUpdateStatus[keyof typeof AdminSocialPostUpdateStatus];


export const AdminSocialPostUpdateStatus = {
  draft: 'draft',
  scheduled: 'scheduled',
} as const;

export interface AdminSocialPostUpdate {
  /**
     * @minLength 1
     * @maxLength 120
     */
  title?: string;
  /**
     * @minLength 1
     * @maxLength 5000
     */
  caption?: string;
  /**
     * @minItems 1
     * @maxItems 5
     */
  platforms?: AdminSocialPlatform[];
  /**
     * @maxItems 6
     * @items.maxLength 400
     */
  mediaUrls?: string[];
  status?: AdminSocialPostUpdateStatus;
  /** @nullable */
  scheduledAt?: string | null;
  /** @nullable */
  campaignId?: number | null;
}

export interface AdminSocialMediaUploadInput {
  contentType: string;
  /**
     * @minimum 1
     * @maximum 10485760
     */
  size: number;
}

export interface AdminSocialMediaUpload {
  uploadUrl: string;
  objectPath: string;
  imageUrl: string;
}

export type AdminCampaignInputStatus = typeof AdminCampaignInputStatus[keyof typeof AdminCampaignInputStatus];


export const AdminCampaignInputStatus = {
  draft: 'draft',
  active: 'active',
  paused: 'paused',
} as const;

export interface AdminCampaignInput {
  /** @minLength 1 */
  name: string;
  /** @minLength 1 */
  channel: string;
  status: AdminCampaignInputStatus;
  startsAt: string;
  endsAt: string;
  /** @items.minimum 1 */
  couponIds: number[];
}

export type AdminCampaignUpdateStatus = typeof AdminCampaignUpdateStatus[keyof typeof AdminCampaignUpdateStatus];


export const AdminCampaignUpdateStatus = {
  draft: 'draft',
  active: 'active',
  paused: 'paused',
} as const;

export interface AdminCampaignUpdate {
  /** @minLength 1 */
  name?: string;
  /** @minLength 1 */
  channel?: string;
  status?: AdminCampaignUpdateStatus;
  startsAt?: string;
  endsAt?: string;
  /** @items.minimum 1 */
  couponIds?: number[];
}

/**
 * @nullable
 */
export type AdminProfileAddress = {
  /** @nullable */
  country: string | null;
  city: string;
  /** @nullable */
  nationalAddressShortCode: string | null;
  district: string;
  street: string;
  buildingNo: string;
  /** @nullable */
  postalCode: string | null;
  /** @nullable */
  additionalNumber: string | null;
  /** @nullable */
  additionalInfo: string | null;
} | null;

export interface AdminCustomer {
  id: number;
  phone: string;
  name: string;
  /** @nullable */
  email?: string | null;
  profileAddress?: AdminProfileAddress | null;
  phoneVerified: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AdminProfileAddressInput {
  country: string;
  city: string;
  /** @nullable */
  nationalAddressShortCode?: string | null;
  /** @nullable */
  district?: string | null;
  /** @nullable */
  street?: string | null;
  /** @nullable */
  buildingNo?: string | null;
  /** @nullable */
  postalCode?: string | null;
  /** @nullable */
  additionalNumber?: string | null;
  /** @nullable */
  additionalInfo?: string | null;
}

export interface AdminCustomerInput {
  /** @minLength 1 */
  name: string;
  /** @minLength 8 */
  phone: string;
  /** @pattern ^[^\s@]+@[^\s@]+\.[^\s@]+$ */
  email: string;
  profileAddress: AdminProfileAddressInput;
}

export interface AdminCustomerUpdate {
  name?: string;
  /** @nullable */
  email?: string | null;
  isActive?: boolean;
}

export type AdminInventoryItemOperationalType = typeof AdminInventoryItemOperationalType[keyof typeof AdminInventoryItemOperationalType];


export const AdminInventoryItemOperationalType = {
  finished_good: 'finished_good',
  raw_material: 'raw_material',
  packaging: 'packaging',
} as const;

export type AdminInventoryItemStockStatus = typeof AdminInventoryItemStockStatus[keyof typeof AdminInventoryItemStockStatus];


export const AdminInventoryItemStockStatus = {
  in_stock: 'in_stock',
  low: 'low',
  out: 'out',
} as const;

export interface AdminInventoryItem {
  id: number;
  nameAr: string;
  nameEn: string;
  displayNameAr?: string;
  displayNameEn?: string;
  invoiceNameAr?: string;
  invoiceNameEn?: string;
  /** @nullable */
  sku: string | null;
  /** @nullable */
  barcode: string | null;
  inventoryNotes: string;
  operationalType: AdminInventoryItemOperationalType;
  unitOfMeasure: string;
  /** @nullable */
  preferredSupplier: string | null;
  sellable: boolean;
  price: number;
  averageCost: number;
  categoryId: number;
  categoryNameAr: string;
  categoryNameEn: string;
  stockQuantity: number;
  reorderPoint: number;
  targetStockQuantity: number;
  stockStatus: AdminInventoryItemStockStatus;
  inventoryValue: number;
  isActive: boolean;
}

export interface AdminInventorySummary {
  totalUnits: number;
  totalValue: number;
  lowStockProducts: number;
  outOfStockProducts: number;
}

export interface AdminInventoryOverview {
  items: AdminInventoryItem[];
  summary: AdminInventorySummary;
}

export type AdminInventoryProductInputOperationalType = typeof AdminInventoryProductInputOperationalType[keyof typeof AdminInventoryProductInputOperationalType];


export const AdminInventoryProductInputOperationalType = {
  finished_good: 'finished_good',
  raw_material: 'raw_material',
  packaging: 'packaging',
} as const;

export interface AdminInventoryProductInput {
  /** @minLength 1 */
  nameAr: string;
  /** @minLength 1 */
  nameEn: string;
  /** @minLength 1 */
  displayNameAr: string;
  /** @minLength 1 */
  displayNameEn: string;
  /** @minLength 1 */
  invoiceNameAr: string;
  /** @minLength 1 */
  invoiceNameEn: string;
  descriptionAr?: string;
  descriptionEn?: string;
  /** @minLength 1 */
  sku: string;
  /** @nullable */
  barcode?: string | null;
  /** @maxLength 2000 */
  inventoryNotes?: string;
  /** @minimum 1 */
  openingLocationId?: number;
  isActive?: boolean;
  operationalType?: AdminInventoryProductInputOperationalType;
  unitOfMeasure?: string;
  /** @nullable */
  preferredSupplier?: string | null;
  sellable?: boolean;
  /** @minimum 1 */
  categoryId: number;
  /** @minimum 0 */
  price: number;
  /** @minimum 0 */
  openingQuantity: number;
  /** @minimum 0 */
  openingUnitCost?: number;
  /** @minimum 0 */
  reorderPoint: number;
  /** @minimum 0 */
  targetStockQuantity: number;
}

export type AdminInventoryProductUpdateOperationalType = typeof AdminInventoryProductUpdateOperationalType[keyof typeof AdminInventoryProductUpdateOperationalType];


export const AdminInventoryProductUpdateOperationalType = {
  finished_good: 'finished_good',
  raw_material: 'raw_material',
  packaging: 'packaging',
} as const;

export interface AdminInventoryProductUpdate {
  /** @minLength 1 */
  nameAr: string;
  /** @minLength 1 */
  nameEn: string;
  /** @minLength 1 */
  displayNameAr: string;
  /** @minLength 1 */
  displayNameEn: string;
  /** @minLength 1 */
  invoiceNameAr: string;
  /** @minLength 1 */
  invoiceNameEn: string;
  /** @minLength 1 */
  sku: string;
  /** @nullable */
  barcode?: string | null;
  /** @maxLength 2000 */
  inventoryNotes?: string;
  isActive?: boolean;
  operationalType: AdminInventoryProductUpdateOperationalType;
  /** @minLength 1 */
  unitOfMeasure: string;
  /** @nullable */
  preferredSupplier?: string | null;
  sellable: boolean;
  /** @minimum 1 */
  categoryId: number;
  /** @minimum 0 */
  price: number;
  /** @minimum 0 */
  reorderPoint: number;
  /** @minimum 0 */
  targetStockQuantity: number;
}

export type AdminInventoryAdjustmentOperation = typeof AdminInventoryAdjustmentOperation[keyof typeof AdminInventoryAdjustmentOperation];


export const AdminInventoryAdjustmentOperation = {
  increase: 'increase',
  decrease: 'decrease',
  adjustment: 'adjustment',
} as const;

export interface AdminInventoryAdjustment {
  operation: AdminInventoryAdjustmentOperation;
  /** @minimum 0 */
  quantity: number;
  /** @minimum 0 */
  unitCost?: number;
  /** @minLength 1 */
  reason: string;
  /**
     * @minLength 8
     * @maxLength 120
     */
  idempotencyKey: string;
}

export interface AdminInventoryAdjustmentResult {
  item: AdminInventoryItem;
  movement: AdminInventoryMovement;
}

export interface AdminDistributor {
  id: number;
  companyName: string;
  contactName: string;
  /** @nullable */
  email?: string | null;
  phone: string;
  /** @nullable */
  city?: string | null;
  /** @nullable */
  countryCode?: string | null;
  /** @nullable */
  address?: string | null;
  /** @nullable */
  nationalAddressShortCode?: string | null;
  /** @nullable */
  district?: string | null;
  /** @nullable */
  street?: string | null;
  /** @nullable */
  buildingNo?: string | null;
  /** @nullable */
  postalCode?: string | null;
  /** @nullable */
  additionalNumber?: string | null;
  /** @nullable */
  taxNumber?: string | null;
  /** @nullable */
  commercialRegistrationNumber?: string | null;
  /** @nullable */
  notes?: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AdminDistributorInput {
  /** @minLength 1 */
  companyName: string;
  /** @minLength 1 */
  contactName: string;
  /** @pattern ^[^\s@]+@[^\s@]+\.[^\s@]+$ */
  email: string;
  /**
     * @minLength 1
     * @pattern ^(?=(?:\D*\d){8,15}\D*$)\+?[\d\s().-]+$
     */
  phone: string;
  /** @nullable */
  city: string | null;
  /**
     * @nullable
     * @pattern ^[A-Za-z]{2}$
     */
  countryCode: string | null;
  /** @nullable */
  address?: string | null;
  /** @nullable */
  nationalAddressShortCode?: string | null;
  /** @nullable */
  district?: string | null;
  /** @nullable */
  street?: string | null;
  /** @nullable */
  buildingNo?: string | null;
  /** @nullable */
  postalCode?: string | null;
  /** @nullable */
  additionalNumber?: string | null;
  /** @nullable */
  taxNumber: string | null;
  /** @nullable */
  commercialRegistrationNumber: string | null;
  /** @nullable */
  notes?: string | null;
  isActive?: boolean;
}

export interface AdminDistributorUpdate {
  companyName?: string;
  contactName?: string;
  /**
     * @minLength 1
     * @pattern ^(?=(?:\D*\d){8,15}\D*$)\+?[\d\s().-]+$
     */
  phone?: string;
  /** @nullable */
  email?: string | null;
  /** @nullable */
  city?: string | null;
  /** @nullable */
  countryCode?: string | null;
  /** @nullable */
  address?: string | null;
  /** @nullable */
  taxNumber?: string | null;
  /** @nullable */
  commercialRegistrationNumber?: string | null;
  /** @nullable */
  nationalAddressShortCode?: string | null;
  /** @nullable */
  district?: string | null;
  /** @nullable */
  street?: string | null;
  /** @nullable */
  buildingNo?: string | null;
  /** @nullable */
  postalCode?: string | null;
  /** @nullable */
  additionalNumber?: string | null;
  /** @nullable */
  notes?: string | null;
  isActive?: boolean;
}

export interface AdminStaffInput {
  email: string;
  /** @minLength 1 */
  name: string;
  /** @minLength 1 */
  jobTitle: string;
  /** @minLength 1 */
  phone: string;
  /** @minLength 8 */
  password: string;
  isActive?: boolean;
  isSuperAdmin?: boolean;
  permissionIds?: number[];
}

export interface AdminStaffUpdate {
  email?: string;
  /** @minLength 1 */
  name?: string;
  /** @minLength 1 */
  jobTitle?: string;
  /** @minLength 1 */
  phone?: string;
  /** @minLength 8 */
  password?: string;
  isActive?: boolean;
  isSuperAdmin?: boolean;
}

export interface AdminPermissionAssignment {
  permissionIds: number[];
}

export interface Employee {
  id: number;
  name: string;
  nationalId: string;
  phone: string;
  /** @nullable */
  email: string | null;
  position: string;
  department: string;
  /** @exclusiveMinimum 0 */
  salary: number;
  hireDate: string;
  isActive: boolean;
  /** @nullable */
  adminUserId: number | null;
}

export interface EmployeeInput {
  /** @minLength 1 */
  name: string;
  /** @minLength 1 */
  nationalId: string;
  /** @minLength 1 */
  phone: string;
  /** @nullable */
  email?: string | null;
  /** @minLength 1 */
  position: string;
  /** @minLength 1 */
  department: string;
  /** @exclusiveMinimum 0 */
  salary: number;
  hireDate: string;
  isActive?: boolean;
  /** @nullable */
  adminUserId?: number | null;
}

export type EmployeeUpdate = EmployeeInput;

export type AttendanceRecordStatus = typeof AttendanceRecordStatus[keyof typeof AttendanceRecordStatus];


export const AttendanceRecordStatus = {
  present: 'present',
  absent: 'absent',
  late: 'late',
  on_leave: 'on_leave',
} as const;

export interface AttendanceRecord {
  id: number;
  employeeId: number;
  date: string;
  /** @nullable */
  checkInTime: string | null;
  /** @nullable */
  checkOutTime: string | null;
  status: AttendanceRecordStatus;
  /** @nullable */
  notes: string | null;
}

export type AttendanceInputStatus = typeof AttendanceInputStatus[keyof typeof AttendanceInputStatus];


export const AttendanceInputStatus = {
  present: 'present',
  absent: 'absent',
  late: 'late',
  on_leave: 'on_leave',
} as const;

export interface AttendanceInput {
  employeeId: number;
  date: string;
  /**
     * @nullable
     * @pattern ^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$
     */
  checkInTime?: string | null;
  /**
     * @nullable
     * @pattern ^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$
     */
  checkOutTime?: string | null;
  status: AttendanceInputStatus;
  /** @nullable */
  notes?: string | null;
}

export type LeaveRequestLeaveType = typeof LeaveRequestLeaveType[keyof typeof LeaveRequestLeaveType];


export const LeaveRequestLeaveType = {
  annual: 'annual',
  sick: 'sick',
  emergency: 'emergency',
  unpaid: 'unpaid',
} as const;

export type LeaveRequestStatus = typeof LeaveRequestStatus[keyof typeof LeaveRequestStatus];


export const LeaveRequestStatus = {
  pending: 'pending',
  approved: 'approved',
  rejected: 'rejected',
} as const;

export interface LeaveRequest {
  id: number;
  employeeId: number;
  leaveType: LeaveRequestLeaveType;
  startDate: string;
  endDate: string;
  status: LeaveRequestStatus;
  reason: string;
  /** @nullable */
  approvedBy: number | null;
}

export type LeaveRequestInputLeaveType = typeof LeaveRequestInputLeaveType[keyof typeof LeaveRequestInputLeaveType];


export const LeaveRequestInputLeaveType = {
  annual: 'annual',
  sick: 'sick',
  emergency: 'emergency',
  unpaid: 'unpaid',
} as const;

export type LeaveRequestInputStatus = typeof LeaveRequestInputStatus[keyof typeof LeaveRequestInputStatus];


export const LeaveRequestInputStatus = {
  pending: 'pending',
  approved: 'approved',
  rejected: 'rejected',
} as const;

export interface LeaveRequestInput {
  employeeId: number;
  leaveType: LeaveRequestInputLeaveType;
  startDate: string;
  endDate: string;
  status?: LeaveRequestInputStatus;
  /** @minLength 1 */
  reason: string;
}

export type LeaveRequestUpdateLeaveType = typeof LeaveRequestUpdateLeaveType[keyof typeof LeaveRequestUpdateLeaveType];


export const LeaveRequestUpdateLeaveType = {
  annual: 'annual',
  sick: 'sick',
  emergency: 'emergency',
  unpaid: 'unpaid',
} as const;

export type LeaveRequestUpdateStatus = typeof LeaveRequestUpdateStatus[keyof typeof LeaveRequestUpdateStatus];


export const LeaveRequestUpdateStatus = {
  pending: 'pending',
  approved: 'approved',
  rejected: 'rejected',
} as const;

export interface LeaveRequestUpdate {
  employeeId?: number;
  leaveType?: LeaveRequestUpdateLeaveType;
  startDate?: string;
  endDate?: string;
  status?: LeaveRequestUpdateStatus;
  /** @minLength 1 */
  reason?: string;
}

export type PayrollRecordPaymentStatus = typeof PayrollRecordPaymentStatus[keyof typeof PayrollRecordPaymentStatus];


export const PayrollRecordPaymentStatus = {
  pending: 'pending',
  paid: 'paid',
} as const;

export interface PayrollRecord {
  id: number;
  employeeId: number;
  /**
     * @minimum 1
     * @maximum 12
     */
  month: number;
  /**
     * @minimum 1900
     * @maximum 2200
     */
  year: number;
  /** @minimum 0 */
  baseSalary: number;
  /** @minimum 0 */
  deductions: number;
  /** @minimum 0 */
  bonuses: number;
  /** @minimum 0 */
  netSalary: number;
  /** @nullable */
  paymentDate: string | null;
  paymentStatus: PayrollRecordPaymentStatus;
}

export type PayrollInputPaymentStatus = typeof PayrollInputPaymentStatus[keyof typeof PayrollInputPaymentStatus];


export const PayrollInputPaymentStatus = {
  pending: 'pending',
  paid: 'paid',
} as const;

export interface PayrollInput {
  employeeId: number;
  /**
     * @minimum 1
     * @maximum 12
     */
  month: number;
  /**
     * @minimum 1900
     * @maximum 2200
     */
  year: number;
  /** @minimum 0 */
  baseSalary: number;
  /** @minimum 0 */
  deductions: number;
  /** @minimum 0 */
  bonuses: number;
  /** @nullable */
  paymentDate?: string | null;
  paymentStatus?: PayrollInputPaymentStatus;
}

/**
 * Exact decimal monetary amount with no more than four fractional digits.
 * @pattern ^-?\d{1,15}(?:\.\d{1,4})?$
 */
export type AccountingAmount = string;

/**
 * Exact non-negative decimal monetary amount with no more than four fractional digits.
 * @pattern ^\d{1,15}(?:\.\d{1,4})?$
 */
export type AccountingUnsignedAmount = string;

export type AccountingAccountAccountType = typeof AccountingAccountAccountType[keyof typeof AccountingAccountAccountType];


export const AccountingAccountAccountType = {
  asset: 'asset',
  liability: 'liability',
  equity: 'equity',
  revenue: 'revenue',
  expense: 'expense',
} as const;

export type AccountingAccountNormalBalance = typeof AccountingAccountNormalBalance[keyof typeof AccountingAccountNormalBalance];


export const AccountingAccountNormalBalance = {
  debit: 'debit',
  credit: 'credit',
} as const;

export interface AccountingAccount {
  id: number;
  /** @minLength 1 */
  code: string;
  /** @minLength 1 */
  nameAr: string;
  /** @minLength 1 */
  nameEn: string;
  accountType: AccountingAccountAccountType;
  normalBalance: AccountingAccountNormalBalance;
  /** @nullable */
  parentId: number | null;
  isPosting: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ManualJournalEntryLineInput {
  accountId: number;
  /** @nullable */
  description?: string | null;
  debit: AccountingUnsignedAmount;
  credit: AccountingUnsignedAmount;
}

export interface ManualJournalEntryInput {
  entryDate: string;
  /** @minLength 1 */
  description: string;
  /** @minItems 2 */
  lines: ManualJournalEntryLineInput[];
}

export interface JournalEntryReversalInput {
  entryDate: string;
  /** @minLength 1 */
  description: string;
}

export interface JournalEntryLine {
  id: number;
  journalEntryId: number;
  /** @minimum 1 */
  lineNumber: number;
  accountId: number;
  /** @nullable */
  description: string | null;
  debit: AccountingUnsignedAmount;
  credit: AccountingUnsignedAmount;
  createdAt: string;
}

export type JournalEntryStatus = typeof JournalEntryStatus[keyof typeof JournalEntryStatus];


export const JournalEntryStatus = {
  posted: 'posted',
  reversed: 'reversed',
} as const;

export interface JournalEntry {
  id: number;
  /** @minLength 1 */
  entryNumber: string;
  entryDate: string;
  /** @minLength 1 */
  description: string;
  status: JournalEntryStatus;
  /** @nullable */
  sourceType: string | null;
  /** @nullable */
  sourceId: string | null;
  /** @nullable */
  reversalOfEntryId: number | null;
  createdBy: number;
  postedBy: number;
  postedAt: string;
  createdAt: string;
  updatedAt: string;
  /** @minItems 2 */
  lines: JournalEntryLine[];
}

export interface JournalEntryActor {
  id: number;
  name: string;
  email: string;
}

export type AdminJournalEntry = JournalEntry & {
  creator: JournalEntryActor;
  poster: JournalEntryActor;
};

export type TrialBalanceAccountAccountType = typeof TrialBalanceAccountAccountType[keyof typeof TrialBalanceAccountAccountType];


export const TrialBalanceAccountAccountType = {
  asset: 'asset',
  liability: 'liability',
  equity: 'equity',
  revenue: 'revenue',
  expense: 'expense',
} as const;

export type TrialBalanceAccountNormalBalance = typeof TrialBalanceAccountNormalBalance[keyof typeof TrialBalanceAccountNormalBalance];


export const TrialBalanceAccountNormalBalance = {
  debit: 'debit',
  credit: 'credit',
} as const;

export interface TrialBalanceAccount {
  accountId: number;
  accountCode: string;
  accountNameAr: string;
  accountNameEn: string;
  accountType: TrialBalanceAccountAccountType;
  normalBalance: TrialBalanceAccountNormalBalance;
  openingBalance: AccountingAmount;
  totalDebit: AccountingUnsignedAmount;
  totalCredit: AccountingUnsignedAmount;
  closingBalance: AccountingAmount;
}

export interface TrialBalance {
  asOf: string;
  accounts: TrialBalanceAccount[];
  totalDebit: AccountingUnsignedAmount;
  totalCredit: AccountingUnsignedAmount;
  isBalanced: boolean;
}

export type ExpenseCategory = typeof ExpenseCategory[keyof typeof ExpenseCategory];


export const ExpenseCategory = {
  rent: 'rent',
  salaries: 'salaries',
  utilities: 'utilities',
  marketing: 'marketing',
  shipping: 'shipping',
  other: 'other',
} as const;

export interface Expense {
  id: number;
  category: ExpenseCategory;
  /** @exclusiveMinimum 0 */
  amount: number;
  description: string;
  expenseDate: string;
  /** @nullable */
  receiptUrl: string | null;
  createdBy: number;
  createdAt: string;
}

export type ExpenseInputCategory = typeof ExpenseInputCategory[keyof typeof ExpenseInputCategory];


export const ExpenseInputCategory = {
  rent: 'rent',
  salaries: 'salaries',
  utilities: 'utilities',
  marketing: 'marketing',
  shipping: 'shipping',
  other: 'other',
} as const;

export interface ExpenseInput {
  category: ExpenseInputCategory;
  /** @exclusiveMinimum 0 */
  amount: number;
  /** @minLength 1 */
  description: string;
  expenseDate: string;
  /** @nullable */
  receiptUrl?: string | null;
}

export type ExpenseUpdate = ExpenseInput;

export type PurchaseCategory = typeof PurchaseCategory[keyof typeof PurchaseCategory];


export const PurchaseCategory = {
  direct_materials_oils: 'direct_materials_oils',
  travel_tickets: 'travel_tickets',
  meeting_hospitality: 'meeting_hospitality',
  shipping: 'shipping',
  marketing: 'marketing',
  utilities: 'utilities',
  other: 'other',
} as const;

export type PurchasePaymentSource = typeof PurchasePaymentSource[keyof typeof PurchasePaymentSource];


export const PurchasePaymentSource = {
  company_account: 'company_account',
  owner_account: 'owner_account',
} as const;

export interface Purchase {
  id: number;
  title: string;
  description: string;
  amount: AccountingUnsignedAmount;
  purchaseDate: string;
  /** @nullable */
  notes: string | null;
  category: PurchaseCategory;
  paymentSource: PurchasePaymentSource;
  /** @nullable */
  invoiceObjectPath: string | null;
  /** @nullable */
  invoiceContentType: string | null;
  /** @nullable */
  invoiceSize: number | null;
  /** @nullable */
  idempotencyKey: string | null;
  /** @nullable */
  archivedAt: string | null;
  createdBy: number;
  createdAt: string;
}

export type AdminBillingSettingsPreferredPaymentMethod = typeof AdminBillingSettingsPreferredPaymentMethod[keyof typeof AdminBillingSettingsPreferredPaymentMethod];


export const AdminBillingSettingsPreferredPaymentMethod = {
  not_set: 'not_set',
  bank_transfer: 'bank_transfer',
} as const;

export interface AdminBillingSettings {
  /** @nullable */
  invoiceEmail: string | null;
  /** @nullable */
  companyName: string | null;
  /** @nullable */
  streetAddress: string | null;
  /** @nullable */
  city: string | null;
  /** @nullable */
  country: string | null;
  /** @nullable */
  taxNumber: string | null;
  /** @nullable */
  bankName: string | null;
  /** @nullable */
  accountHolder: string | null;
  /**
     * Masked for finance view-only users
     * @nullable
     */
  accountNumber: string | null;
  /**
     * Masked for finance view-only users
     * @nullable
     */
  iban: string | null;
  preferredPaymentMethod: AdminBillingSettingsPreferredPaymentMethod;
  /** @nullable */
  updatedAt: string | null;
}

export type AdminBillingSettingsUpdatePreferredPaymentMethod = typeof AdminBillingSettingsUpdatePreferredPaymentMethod[keyof typeof AdminBillingSettingsUpdatePreferredPaymentMethod];


export const AdminBillingSettingsUpdatePreferredPaymentMethod = {
  not_set: 'not_set',
  bank_transfer: 'bank_transfer',
} as const;

export interface AdminBillingSettingsUpdate {
  /**
     * @maxLength 254
     * @nullable
     * @pattern ^[^\s@]+@[^\s@]+\.[^\s@]+$
     */
  invoiceEmail?: string | null;
  /**
     * @minLength 1
     * @maxLength 160
     * @nullable
     */
  companyName?: string | null;
  /**
     * @minLength 1
     * @maxLength 300
     * @nullable
     */
  streetAddress?: string | null;
  /**
     * @minLength 1
     * @maxLength 120
     * @nullable
     */
  city?: string | null;
  /**
     * @minLength 1
     * @maxLength 120
     * @nullable
     */
  country?: string | null;
  /**
     * @nullable
     * @pattern ^[0-9]{15}$
     */
  taxNumber?: string | null;
  /**
     * @minLength 1
     * @maxLength 120
     * @nullable
     */
  bankName?: string | null;
  /**
     * @minLength 1
     * @maxLength 160
     * @nullable
     */
  accountHolder?: string | null;
  /**
     * @nullable
     * @pattern ^[0-9]{6,24}$
     */
  accountNumber?: string | null;
  /**
     * @nullable
     * @pattern ^SA[0-9]{22}$
     */
  iban?: string | null;
  preferredPaymentMethod?: AdminBillingSettingsUpdatePreferredPaymentMethod;
}

export type PurchaseInputCategory = typeof PurchaseInputCategory[keyof typeof PurchaseInputCategory];


export const PurchaseInputCategory = {
  direct_materials_oils: 'direct_materials_oils',
  travel_tickets: 'travel_tickets',
  meeting_hospitality: 'meeting_hospitality',
  shipping: 'shipping',
  marketing: 'marketing',
  utilities: 'utilities',
  other: 'other',
} as const;

export type PurchaseInputPaymentSource = typeof PurchaseInputPaymentSource[keyof typeof PurchaseInputPaymentSource];


export const PurchaseInputPaymentSource = {
  company_account: 'company_account',
  owner_account: 'owner_account',
} as const;

export interface PurchaseInput {
  /** @minLength 1 */
  title: string;
  /** @minLength 1 */
  description: string;
  amount: AccountingUnsignedAmount;
  purchaseDate?: string;
  /** @nullable */
  notes?: string | null;
  category: PurchaseInputCategory;
  paymentSource: PurchaseInputPaymentSource;
  /** @nullable */
  invoiceObjectPath?: string | null;
  /** @nullable */
  invoiceContentType?: string | null;
  /** @nullable */
  invoiceSize?: number | null;
}

export interface PurchaseInvoiceUploadInput {
  contentType: string;
  size: number;
}

export interface PurchaseInvoiceUploadResponse {
  uploadUrl: string;
  objectPath: string;
}

export interface FinanceMetrics {
  from: string;
  to: string;
  revenue: number;
  expenses: number;
  netProfit: number;
  paidOrderCount: number;
  averageOrderValue: number;
}

export type FinancialPeriodStatus = typeof FinancialPeriodStatus[keyof typeof FinancialPeriodStatus];


export const FinancialPeriodStatus = {
  draft: 'draft',
  closed: 'closed',
} as const;

export interface FinancialPeriod {
  id: number;
  periodStart: string;
  periodEnd: string;
  /** @minimum 0 */
  totalRevenue: number;
  /** @minimum 0 */
  totalExpenses: number;
  netProfit: number;
  status: FinancialPeriodStatus;
}

export type MonthlyFinanceMetrics = FinanceMetrics & {
  /** @pattern ^\d{4}-\d{2}$ */
  month: string;
};

export type ManufacturingBatchStatus = typeof ManufacturingBatchStatus[keyof typeof ManufacturingBatchStatus];


export const ManufacturingBatchStatus = {
  in_production: 'in_production',
  completed: 'completed',
  quality_check: 'quality_check',
  approved: 'approved',
  rejected: 'rejected',
} as const;

export interface ManufacturingBatch {
  id: number;
  batchNumber: string;
  productId: number;
  /** @minimum 1 */
  quantityProduced: number;
  productionDate: string;
  /** @nullable */
  expiryDate: string | null;
  /** @minimum 0 */
  costPerUnit: number;
  status: ManufacturingBatchStatus;
}

export type ManufacturingBatchInputStatus = typeof ManufacturingBatchInputStatus[keyof typeof ManufacturingBatchInputStatus];


export const ManufacturingBatchInputStatus = {
  in_production: 'in_production',
  completed: 'completed',
  quality_check: 'quality_check',
  approved: 'approved',
  rejected: 'rejected',
} as const;

export interface ManufacturingBatchInput {
  /** @minLength 1 */
  batchNumber: string;
  productId: number;
  /** @minimum 1 */
  quantityProduced: number;
  productionDate: string;
  /** @nullable */
  expiryDate?: string | null;
  /** @minimum 0 */
  costPerUnit: number;
  status: ManufacturingBatchInputStatus;
}

export type ManufacturingBatchUpdate = ManufacturingBatchInput;

export type ExhibitionStatus = typeof ExhibitionStatus[keyof typeof ExhibitionStatus];


export const ExhibitionStatus = {
  planned: 'planned',
  ongoing: 'ongoing',
  completed: 'completed',
  cancelled: 'cancelled',
} as const;

export interface Exhibition {
  id: number;
  name: string;
  location: string;
  startDate: string;
  endDate: string;
  /** @minimum 0 */
  budget: number;
  status: ExhibitionStatus;
  /** @nullable */
  notes: string | null;
}

export type ExhibitionInputStatus = typeof ExhibitionInputStatus[keyof typeof ExhibitionInputStatus];


export const ExhibitionInputStatus = {
  planned: 'planned',
  ongoing: 'ongoing',
  completed: 'completed',
  cancelled: 'cancelled',
} as const;

export interface ExhibitionInput {
  /** @minLength 1 */
  name: string;
  /** @minLength 1 */
  location: string;
  startDate: string;
  endDate: string;
  /** @minimum 0 */
  budget: number;
  status: ExhibitionInputStatus;
  /** @nullable */
  notes?: string | null;
}

export type ExhibitionUpdate = ExhibitionInput;

export interface ExhibitionProduct {
  id: number;
  exhibitionId: number;
  productId: number;
  /** @minimum 0 */
  quantityAllocated: number;
  /** @minimum 0 */
  quantitySold: number;
  productNameAr: string;
  productNameEn: string;
  /** @nullable */
  productSku: string | null;
  productPrice: number;
}

export interface ExhibitionProductInput {
  productId: number;
  /** @minimum 0 */
  quantityAllocated: number;
  /** @minimum 0 */
  quantitySold?: number;
}

export type GiftingIssueStockSource = typeof GiftingIssueStockSource[keyof typeof GiftingIssueStockSource];


export const GiftingIssueStockSource = {
  normal: 'normal',
  used_return: 'used_return',
} as const;

/**
 * @nullable
 */
export type GiftingIssueReturnCondition = typeof GiftingIssueReturnCondition[keyof typeof GiftingIssueReturnCondition] | null;


export const GiftingIssueReturnCondition = {
  new: 'new',
  used: 'used',
  mixed: 'mixed',
} as const;

export type GiftingIssueCategory = typeof GiftingIssueCategory[keyof typeof GiftingIssueCategory];


export const GiftingIssueCategory = {
  VIP: 'VIP',
  Sample: 'Sample',
  Damage: 'Damage',
  Marketing: 'Marketing',
  Tester: 'Tester',
  B2B_EVALUATION: 'B2B_EVALUATION',
  TESTER: 'TESTER',
  VIP_GIFT: 'VIP_GIFT',
  INFLUENCERS: 'INFLUENCERS',
  DAMAGED: 'DAMAGED',
  OTHER: 'OTHER',
} as const;

export interface GiftingIssue {
  id: number;
  /** @nullable */
  recipientName?: string | null;
  /** @nullable */
  city?: string | null;
  /** @nullable */
  country?: string | null;
  category: GiftingIssueCategory;
  comment: string;
  /** @nullable */
  reason?: string | null;
  /** @nullable */
  occasion?: string | null;
  /** @nullable */
  program?: string | null;
  productId: number;
  barcode: string;
  descriptionSnapshot: string;
  /** @minimum 1 */
  quantity: number;
  stockSource: GiftingIssueStockSource;
  /** @minimum 0 */
  returnedQuantity: number;
  /** @nullable */
  returnCondition?: GiftingIssueReturnCondition;
  /** @nullable */
  returnedAt?: string | null;
  totalCost: string;
  issueDate: string;
  /** @nullable */
  sourceFilename?: string | null;
  /** @nullable */
  sourceSheet?: string | null;
  /** @nullable */
  sourceRow?: number | null;
  dedupeKey: string;
  /** @nullable */
  idempotencyKey?: string | null;
  importedAt: string;
}

export type GiftingIssueLineInputStockSource = typeof GiftingIssueLineInputStockSource[keyof typeof GiftingIssueLineInputStockSource];


export const GiftingIssueLineInputStockSource = {
  normal: 'normal',
  used_return: 'used_return',
} as const;

export interface GiftingIssueLineInput {
  /** @minimum 1 */
  productId: number;
  /** @minimum 1 */
  quantity: number;
  stockSource?: GiftingIssueLineInputStockSource;
}

export type GiftingIssueInputCategory = typeof GiftingIssueInputCategory[keyof typeof GiftingIssueInputCategory];


export const GiftingIssueInputCategory = {
  VIP: 'VIP',
  Sample: 'Sample',
  Damage: 'Damage',
  Marketing: 'Marketing',
  Tester: 'Tester',
  B2B_EVALUATION: 'B2B_EVALUATION',
  TESTER: 'TESTER',
  VIP_GIFT: 'VIP_GIFT',
  INFLUENCERS: 'INFLUENCERS',
  DAMAGED: 'DAMAGED',
  OTHER: 'OTHER',
} as const;

export type GiftingIssueInput = ({
  /** @minItems 1 */
  lines: GiftingIssueLineInput[];
} | {
  /**
     * Legacy single-line form
     * @minimum 1
     */
  productId: number;
  /**
     * Legacy single-line form
     * @minimum 1
     */
  quantity: number;
}) & {
  category: GiftingIssueInputCategory;
  issueDate?: string;
  /** @maxLength 200 */
  recipientName?: string;
  /** @maxLength 120 */
  city?: string;
  /** @maxLength 120 */
  country?: string;
  /** @maxLength 500 */
  occasion?: string;
  /** @maxLength 500 */
  reason?: string;
  /** @maxLength 500 */
  comment?: string;
  /**
     * @minLength 1
     * @maxLength 200
     */
  idempotencyKey: string;
};

export interface GiftingIssueUpdate {
  category?: GiftingIssueCategory;
  /** @minimum 1 */
  quantity?: number;
  issueDate?: string;
  /**
     * @maxLength 200
     * @nullable
     */
  recipientName?: string | null;
  /**
     * @maxLength 120
     * @nullable
     */
  city?: string | null;
  /**
     * @maxLength 120
     * @nullable
     */
  country?: string | null;
  /**
     * @maxLength 500
     * @nullable
     */
  occasion?: string | null;
  /**
     * @maxLength 500
     * @nullable
     */
  reason?: string | null;
  /** @maxLength 500 */
  comment?: string;
}

export interface TesterStockAvailability {
  productId: number;
  /** @minimum 0 */
  normalAvailable: number;
  /** @minimum 0 */
  usedReturnAvailable: number;
  /** @minimum 0 */
  totalAvailable: number;
}

export type B2BEvaluationReturnInputCondition = typeof B2BEvaluationReturnInputCondition[keyof typeof B2BEvaluationReturnInputCondition];


export const B2BEvaluationReturnInputCondition = {
  new: 'new',
  used: 'used',
} as const;

export interface B2BEvaluationReturnInput {
  /** @minimum 1 */
  quantity: number;
  condition: B2BEvaluationReturnInputCondition;
  /**
     * @minLength 1
     * @maxLength 200
     */
  idempotencyKey: string;
}

export interface InfluencerLogin {
  email: string;
  /** @minLength 8 */
  password: string;
}

export interface Influencer {
  id: number;
  name: string;
  email: string;
  /** @nullable */
  imageUrl?: string | null;
  referralCode: string;
  commissionRate: number;
  isActive?: boolean;
  couponIds?: number[];
}

export interface InfluencerAuth {
  token: string;
  influencer: Influencer;
}

export type InfluencerInput = InfluencerLogin & {
  name: string;
  referralCode: string;
  /**
     * @minimum 0
     * @maximum 100
     */
  commissionRate?: number;
};

export type InfluencerDashboardCodesItem = { [key: string]: unknown };

export type InfluencerDashboardOrdersItem = { [key: string]: unknown };

export interface InfluencerDashboardRange {
  from: string;
  to: string;
}

export interface InfluencerDashboardSummary {
  visits: number;
  attributedPaidOrders: number;
  sales: number;
  commission: number;
  conversionRate: number;
  averageOrderValue: number;
}

export interface InfluencerDashboardChange {
  absolute: number;
  /** @nullable */
  percent: number | null;
}

export interface InfluencerDashboardChanges {
  visits: InfluencerDashboardChange;
  attributedPaidOrders: InfluencerDashboardChange;
  sales: InfluencerDashboardChange;
  commission: InfluencerDashboardChange;
  conversionRate: InfluencerDashboardChange;
  averageOrderValue: InfluencerDashboardChange;
}

export interface InfluencerDashboardSeriesPoint {
  day: string;
  orders: number;
  sales: number;
  commission: number;
}

export interface InfluencerDashboard {
  range: InfluencerDashboardRange;
  previousRange: InfluencerDashboardRange;
  summary: InfluencerDashboardSummary;
  previousSummary: InfluencerDashboardSummary;
  changes: InfluencerDashboardChanges;
  series: InfluencerDashboardSeriesPoint[];
  previousSeries: InfluencerDashboardSeriesPoint[];
  referralUrl: string;
  codes: InfluencerDashboardCodesItem[];
  orders: InfluencerDashboardOrdersItem[];
}

export interface InfluencerPatchBody {
  name?: string;
  email?: string;
  /** @minLength 8 */
  password?: string;
  referralCode?: string;
  /** @nullable */
  imageUrl?: string | null;
  /**
     * @minimum 0
     * @maximum 100
     */
  commissionRate?: number;
  isActive?: boolean;
}

export interface CouponLink {
  /** @minimum 1 */
  couponId: number;
}

export type OpeningBalanceLineInputProvenance = {
  file: string;
  sheet: string;
  row: number;
};

export interface OpeningBalanceLineInput {
  /** @minimum 1 */
  sourceRow: number;
  sourceLabel: string;
  sourceQuantity?: string | number;
  /** @minimum 0 */
  openingQuantity: number;
  /** @minimum 0 */
  fullBatchUnitCost: string | number;
  /** @nullable */
  productId?: number | null;
  /** @nullable */
  mappingNote?: string | null;
  provenance: OpeningBalanceLineInputProvenance;
}

export interface OpeningBalanceImportInput {
  /** @minLength 1 */
  importKey: string;
  /** @minLength 1 */
  sourceFileName: string;
  /** @minLength 1 */
  sourceSheet: string;
  /** @minItems 1 */
  lines: OpeningBalanceLineInput[];
}

export interface OpeningBalanceApprovalInput {
  entryDate: string;
}

export interface OpeningBalanceMappingInput {
  /** @nullable */
  productId?: number | null;
  /** @nullable */
  mappingNote?: string | null;
}

export type OpeningBalanceImportValuationMethod = typeof OpeningBalanceImportValuationMethod[keyof typeof OpeningBalanceImportValuationMethod];


export const OpeningBalanceImportValuationMethod = {
  weighted_average: 'weighted_average',
} as const;

export type OpeningBalanceImportStatus = typeof OpeningBalanceImportStatus[keyof typeof OpeningBalanceImportStatus];


export const OpeningBalanceImportStatus = {
  draft: 'draft',
  review: 'review',
  approved: 'approved',
  rejected: 'rejected',
} as const;

export interface OpeningBalanceImport {
  id: number;
  importKey: string;
  sourceFileName: string;
  sourceSheet: string;
  valuationMethod: OpeningBalanceImportValuationMethod;
  status: OpeningBalanceImportStatus;
}

export type OpeningBalanceReconciliation = OpeningBalanceImport & {
  lineCount?: number;
  mappedCount?: number;
  unmappedCount?: number;
  lines?: OpeningBalanceLineInput[];
};

export type OwnerOperationsSummaryInventory = {
  quantity?: number;
  value?: string;
};

export type OwnerOperationsSummaryEvents = {
  total?: number;
  posted?: number;
  pending?: number;
};

export interface OwnerOperationsSummary {
  inventory: OwnerOperationsSummaryInventory;
  events: OwnerOperationsSummaryEvents;
  openingBalance: OpeningBalanceImport | null;
}

export type PurchaseReceiptInputPaymentStatus = typeof PurchaseReceiptInputPaymentStatus[keyof typeof PurchaseReceiptInputPaymentStatus];


export const PurchaseReceiptInputPaymentStatus = {
  unpaid: 'unpaid',
  paid: 'paid',
  partial: 'partial',
} as const;

export type PurchaseReceiptInputPaymentSource = typeof PurchaseReceiptInputPaymentSource[keyof typeof PurchaseReceiptInputPaymentSource];


export const PurchaseReceiptInputPaymentSource = {
  company_account: 'company_account',
  owner_account: 'owner_account',
} as const;

export interface PurchaseReceiptLineInput {
  /** @minimum 1 */
  productId: number;
  /** @minimum 1 */
  quantity: number;
  /** @minimum 0 */
  unitCost: string | number;
}

export interface PurchaseReceiptInput {
  receiptNumber: string;
  vendorName: string;
  /** @nullable */
  vendorReference?: string | null;
  /** @nullable */
  purchaseId?: number | null;
  receiptDate: string;
  paymentStatus?: PurchaseReceiptInputPaymentStatus;
  paymentSource?: PurchaseReceiptInputPaymentSource;
  /** @minimum 0 */
  paidAmount?: string | number;
  /** @nullable */
  paymentReference?: string | null;
  /** @minItems 1 */
  lines: PurchaseReceiptLineInput[];
}

export type PurchaseReceiptPaymentInputPaymentSource = typeof PurchaseReceiptPaymentInputPaymentSource[keyof typeof PurchaseReceiptPaymentInputPaymentSource];


export const PurchaseReceiptPaymentInputPaymentSource = {
  company_account: 'company_account',
  owner_account: 'owner_account',
} as const;

export interface PurchaseReceiptPaymentInput {
  /** @minLength 1 */
  paymentKey: string;
  paymentDate: string;
  /** @minimum 0 */
  amount: string | number;
  paymentSource: PurchaseReceiptPaymentInputPaymentSource;
  /** @nullable */
  paymentReference?: string | null;
}

export type PurchaseReceiptPaymentPaymentSource = typeof PurchaseReceiptPaymentPaymentSource[keyof typeof PurchaseReceiptPaymentPaymentSource];


export const PurchaseReceiptPaymentPaymentSource = {
  company_account: 'company_account',
  owner_account: 'owner_account',
} as const;

export interface PurchaseReceiptPayment {
  id: number;
  receiptId: number;
  paymentKey: string;
  paymentDate: string;
  amount: string;
  paymentSource: PurchaseReceiptPaymentPaymentSource;
  /** @nullable */
  paymentReference?: string | null;
}

export type PurchaseReceiptStatus = typeof PurchaseReceiptStatus[keyof typeof PurchaseReceiptStatus];


export const PurchaseReceiptStatus = {
  draft: 'draft',
  posted: 'posted',
  voided: 'voided',
} as const;

export type PurchaseReceiptPaymentStatus = typeof PurchaseReceiptPaymentStatus[keyof typeof PurchaseReceiptPaymentStatus];


export const PurchaseReceiptPaymentStatus = {
  unpaid: 'unpaid',
  paid: 'paid',
  partial: 'partial',
} as const;

export interface PurchaseReceipt {
  id: number;
  receiptNumber: string;
  vendorName: string;
  receiptDate: string;
  amount: string;
  paidAmount?: string;
  /** @nullable */
  paymentReference?: string | null;
  status: PurchaseReceiptStatus;
  paymentStatus: PurchaseReceiptPaymentStatus;
}

export interface ManufacturingInput {
  /** @minimum 1 */
  materialProductId: number;
  /** @minimum 1 */
  quantity: number;
}

export interface ManufacturingInputsInput {
  /** @minItems 1 */
  lines: ManufacturingInput[];
}

/**
 * Invalid request
 */
export type BadRequestResponse = Error;

/**
 * Authentication required
 */
export type UnauthorizedResponse = Error;

/**
 * Insufficient permission
 */
export type ForbiddenResponse = Error;

/**
 * Service is not configured
 */
export type ServiceUnavailableResponse = Error;

/**
 * Resource not found
 */
export type NotFoundResponse = Error;

/**
 * Resource conflict
 */
export type ConflictResponse = Error;

/**
 * Too many requests
 */
export type RateLimitedResponse = Error;

export type AdminSearchParameter = string;

export type AdminStatusParameter = typeof AdminStatusParameter[keyof typeof AdminStatusParameter];


export const AdminStatusParameter = {
  active: 'active',
  inactive: 'inactive',
  all: 'all',
} as const;

export type CategorySlugParameter = string;

export type ListProductsParams = {
category?: CategorySlugParameter;
sort?: ListProductsSort;
search?: string;
/**
 * @minimum 0
 */
minPrice?: number;
/**
 * @minimum 0
 */
maxPrice?: number;
/**
 * @minimum 1
 * @maximum 48
 */
limit?: number;
};

export type ListProductsSort = typeof ListProductsSort[keyof typeof ListProductsSort];


export const ListProductsSort = {
  featured: 'featured',
  bestseller: 'bestseller',
  price_asc: 'price_asc',
  price_desc: 'price_desc',
  newest: 'newest',
} as const;

export type AdminListContractsParams = {
search?: AdminSearchParameter;
};

export type GetPublicContractVerification200Status = typeof GetPublicContractVerification200Status[keyof typeof GetPublicContractVerification200Status];


export const GetPublicContractVerification200Status = {
  final: 'final',
} as const;

export type GetPublicContractVerification200 = {
  contractNumber: string;
  status: GetPublicContractVerification200Status;
  /** @nullable */
  sellerSignedAt?: string | null;
  /** @nullable */
  buyerSignedAt?: string | null;
};

export type GetAdminAnalyticsDashboardParams = {
rangeDays?: GetAdminAnalyticsDashboardRangeDays;
};

export type GetAdminAnalyticsDashboardRangeDays = typeof GetAdminAnalyticsDashboardRangeDays[keyof typeof GetAdminAnalyticsDashboardRangeDays];


export const GetAdminAnalyticsDashboardRangeDays = {
  NUMBER_7: 7,
  NUMBER_30: 30,
  NUMBER_90: 90,
} as const;

export type GetAdminRevenueAnalyticsParams = {
rangeDays?: GetAdminRevenueAnalyticsRangeDays;
};

export type GetAdminRevenueAnalyticsRangeDays = typeof GetAdminRevenueAnalyticsRangeDays[keyof typeof GetAdminRevenueAnalyticsRangeDays];


export const GetAdminRevenueAnalyticsRangeDays = {
  NUMBER_7: 7,
  NUMBER_30: 30,
  NUMBER_90: 90,
  NUMBER_365: 365,
} as const;

export type AdminListProductsParams = {
search?: AdminSearchParameter;
status?: AdminStatusParameter;
};

export type AdminListCategoriesParams = {
search?: AdminSearchParameter;
status?: AdminStatusParameter;
};

export type AdminListOrdersParams = {
search?: AdminSearchParameter;
status?: AdminListOrdersStatus;
};

export type AdminListOrdersStatus = typeof AdminListOrdersStatus[keyof typeof AdminListOrdersStatus];


export const AdminListOrdersStatus = {
  all: 'all',
  cancelled: 'cancelled',
  returned: 'returned',
  pending_review: 'pending_review',
  preparing: 'preparing',
  out_for_delivery: 'out_for_delivery',
  delivered: 'delivered',
  pending_payment: 'pending_payment',
} as const;

export type AdminListInvoicesParams = {
search?: AdminSearchParameter;
channel?: AdminListInvoicesChannel;
receivableStatus?: AdminListInvoicesReceivableStatus;
};

export type AdminListInvoicesChannel = typeof AdminListInvoicesChannel[keyof typeof AdminListInvoicesChannel];


export const AdminListInvoicesChannel = {
  all: 'all',
  companies: 'companies',
  online: 'online',
  exhibitions: 'exhibitions',
} as const;

export type AdminListInvoicesReceivableStatus = typeof AdminListInvoicesReceivableStatus[keyof typeof AdminListInvoicesReceivableStatus];


export const AdminListInvoicesReceivableStatus = {
  all: 'all',
  open: 'open',
  overdue: 'overdue',
  paid: 'paid',
} as const;

export type GetAdminShippingDashboardParams = {
channel: GetAdminShippingDashboardChannel;
from?: string;
to?: string;
status?: GetAdminShippingDashboardStatus;
city?: string;
search?: AdminSearchParameter;
page?: number;
pageSize?: number;
};

export type GetAdminShippingDashboardChannel = typeof GetAdminShippingDashboardChannel[keyof typeof GetAdminShippingDashboardChannel];


export const GetAdminShippingDashboardChannel = {
  online: 'online',
  b2b: 'b2b',
} as const;

export type GetAdminShippingDashboardStatus = typeof GetAdminShippingDashboardStatus[keyof typeof GetAdminShippingDashboardStatus];


export const GetAdminShippingDashboardStatus = {
  all: 'all',
  pending: 'pending',
  ready: 'ready',
  in_transit: 'in_transit',
  delivered: 'delivered',
  returned: 'returned',
  cancelled: 'cancelled',
} as const;

export type AdminListCouponsParams = {
search?: AdminSearchParameter;
status?: AdminStatusParameter;
};

export type AdminGetCampaignResultsParams = {
from?: string;
to?: string;
/**
 * @minLength 1
 */
channel?: string;
};

export type AdminExportCampaignResultsParams = {
from?: string;
to?: string;
/**
 * @minLength 1
 */
channel?: string;
format: AdminExportCampaignResultsFormat;
};

export type AdminExportCampaignResultsFormat = typeof AdminExportCampaignResultsFormat[keyof typeof AdminExportCampaignResultsFormat];


export const AdminExportCampaignResultsFormat = {
  csv: 'csv',
  xlsx: 'xlsx',
} as const;

export type AdminListCustomersParams = {
search?: AdminSearchParameter;
status?: AdminStatusParameter;
};

export type AdminListInventoryParams = {
search?: AdminSearchParameter;
/**
 * @minimum 1
 */
categoryId?: number;
stockStatus?: AdminListInventoryStockStatus;
sort?: AdminListInventorySort;
};

export type AdminListInventoryStockStatus = typeof AdminListInventoryStockStatus[keyof typeof AdminListInventoryStockStatus];


export const AdminListInventoryStockStatus = {
  all: 'all',
  in_stock: 'in_stock',
  low: 'low',
  out: 'out',
} as const;

export type AdminListInventorySort = typeof AdminListInventorySort[keyof typeof AdminListInventorySort];


export const AdminListInventorySort = {
  name_asc: 'name_asc',
  name_desc: 'name_desc',
  quantity_asc: 'quantity_asc',
  quantity_desc: 'quantity_desc',
  value_desc: 'value_desc',
} as const;

export type AdminListDistributorsParams = {
search?: AdminSearchParameter;
status?: AdminStatusParameter;
};

export type AdminListEmployeesParams = {
search?: AdminSearchParameter;
status?: AdminStatusParameter;
};

export type AdminListJournalEntriesParams = {
from?: string;
to?: string;
};

export type AdminGetTrialBalanceParams = {
as_of: string;
};

export type AdminGetFinanceSummaryParams = {
from: string;
to: string;
};

export type GetAdminGiftingIssuesParams = {
category?: GiftingIssueCategory;
search?: string;
};

export type GetAdminGiftingIssues200Summary = {
  rows?: number;
  units?: number;
  totalCost?: string;
};

export type GetAdminGiftingIssues200 = {
  rows: GiftingIssue[];
  summary: GetAdminGiftingIssues200Summary;
};

export type GetAdminTesterAvailabilityParams = {
/**
 * @minimum 1
 */
productId: number;
};

export type InfluencerDashboardParams = {
rangeDays?: InfluencerDashboardRangeDays;
from?: string;
to?: string;
};

export type InfluencerDashboardRangeDays = typeof InfluencerDashboardRangeDays[keyof typeof InfluencerDashboardRangeDays];


export const InfluencerDashboardRangeDays = {
  NUMBER_7: 7,
  NUMBER_30: 30,
  NUMBER_90: 90,
} as const;

export type CaptureInfluencerReferralParams = {
ref: string;
};

export type ListInventoryBalancesParams = {
locationId?: number;
};

export type GetInventoryValueReportParams = {
format?: GetInventoryValueReportFormat;
};

export type GetInventoryValueReportFormat = typeof GetInventoryValueReportFormat[keyof typeof GetInventoryValueReportFormat];


export const GetInventoryValueReportFormat = {
  json: 'json',
  csv: 'csv',
} as const;

export type GetInventoryMovementReportParams = {
productId?: number;
sourceType?: string;
from?: string;
to?: string;
/**
 * @minimum 1
 */
page?: number;
/**
 * @minimum 1
 * @maximum 100
 */
pageSize?: number;
format?: GetInventoryMovementReportFormat;
};

export type GetInventoryMovementReportFormat = typeof GetInventoryMovementReportFormat[keyof typeof GetInventoryMovementReportFormat];


export const GetInventoryMovementReportFormat = {
  json: 'json',
  csv: 'csv',
} as const;

export type GetInventoryValuationReportParams = {
format?: GetInventoryValuationReportFormat;
};

export type GetInventoryValuationReportFormat = typeof GetInventoryValuationReportFormat[keyof typeof GetInventoryValuationReportFormat];


export const GetInventoryValuationReportFormat = {
  json: 'json',
  csv: 'csv',
} as const;

export type GetInventoryAuditReportParams = {
productId?: number;
sourceType?: string;
from?: string;
to?: string;
/**
 * @minimum 1
 */
page?: number;
/**
 * @minimum 1
 * @maximum 100
 */
pageSize?: number;
format?: GetInventoryAuditReportFormat;
};

export type GetInventoryAuditReportFormat = typeof GetInventoryAuditReportFormat[keyof typeof GetInventoryAuditReportFormat];


export const GetInventoryAuditReportFormat = {
  json: 'json',
  csv: 'csv',
} as const;


/**
 * Generated by orval v8.23.0 🍺
 * Do not edit manually.
 * Api
 * Public storefront API for Musk Ellolo
 * OpenAPI spec version: 0.1.0
 */
export interface OwnerEvidenceUploadRequest {
  contentType: string;
  size: number;
}

export interface AdminOwnerEvidenceUpload {
  uploadUrl: string;
  objectPath: string;
}

export interface OwnerObligationInput {
  /**
     * @minLength 1
     * @maxLength 200
     */
  name: string;
  /** @pattern ^\d{1,14}(\.\d{1,4})?$ */
  amount: string;
  /** @pattern ^\d{4}-\d{2}-\d{2}$ */
  dueDate: string;
  recurrence: OwnerObligationInputRecurrence;
  liableParty: OwnerObligationInputLiableParty;
  /** @minLength 1 */
  clientKey: string;
}

export const OwnerObligationEventInputKind = {
  payment: 'payment',
  transfer: 'transfer',
} as const;

export interface OwnerObligationEventInput {
  kind: OwnerObligationEventInputKind;
  amount?: string;
  eventDate: string;
  payer?: OwnerObligationEventInputPayer;
  /** @minLength 1 */
  clientKey: string;
}

export type OwnerJournalDecisionInputDecision = typeof OwnerJournalDecisionInputDecision[keyof typeof OwnerJournalDecisionInputDecision];

export const OwnerObligationInputLiableParty = {
  owner: 'owner',
  company: 'company',
} as const;

export const OwnerJournalDecisionInputDecision = {
  retain: 'retain',
  reverse: 'reverse',
} as const;

export interface OwnerObligationInstallmentInput {
  amount: string;
  dueDate: string;
}

export const OwnerObligationEventInputPayer = {
  owner: 'owner',
  company: 'company',
} as const;

export interface OwnerEventReviewInput {
  decision: OwnerEventReviewInputDecision;
  evidence?: string;
  accountCode?: string;
  reason?: string;
}

export interface OwnerEventCorrectionInput {
  /** @minLength 1 */
  reason: string;
  /** @minLength 1 */
  evidence: string;
  /** @pattern ^\d{4}-\d{2}-\d{2}$ */
  entryDate: string;
}

export type OwnerEventReviewInputDecision = typeof OwnerEventReviewInputDecision[keyof typeof OwnerEventReviewInputDecision];

export type OwnerObligationInstallmentRevisionsItem = {
  id: number;
  previousDate: string;
  previousAmount: string;
  nextDate: string;
  nextAmount: string;
  changedBy: number;
  changedAt: string;
};

export interface OwnerObligation {
  id: number;
  name: string;
  amount: string;
  dueDate: string;
  recurrence: string;
  /** @nullable */
  renewalOf?: number | null;
  liableParty: string;
  effectiveLiableParty: string;
  paid: string;
  remaining: string;
  createdAt: string;
  events: OwnerObligationEvent[];
  installments: OwnerObligationInstallment[];
}

export interface OwnerObligationInstallment {
  id: number;
  obligationId: number;
  amount: string;
  dueDate: string;
  createdAt: string;
  revisions?: OwnerObligationInstallmentRevisionsItem[];
}

export interface OwnerJournalReview {
  id: number;
  journalEntryId: number;
  decision: string;
  reason: string;
  evidence: string;
  reviewedBy: number;
  /** @nullable */
  reversalEntryId?: number | null;
  createdAt: string;
}

export type OwnerObligationInputLiableParty = typeof OwnerObligationInputLiableParty[keyof typeof OwnerObligationInputLiableParty];

export type OwnerObligationEventInputPayer = typeof OwnerObligationEventInputPayer[keyof typeof OwnerObligationEventInputPayer];

export const OwnerEventReviewInputDecision = {
  approved: 'approved',
  rejected: 'rejected',
} as const;

/**
 * @nullable
 */
export type OwnerJournalReportEntriesItemSourceDetail = {
  id?: number;
  title?: string;
  paymentSource?: string;
} | null;

export interface OwnerJournalReport {
  balance: string;
  note: string;
  entries: OwnerJournalReportEntriesItem[];
}

export type OwnerObligationInputRecurrence = typeof OwnerObligationInputRecurrence[keyof typeof OwnerObligationInputRecurrence];

export interface OwnerObligationEvent {
  id: number;
  obligationId: number;
  kind: string;
  amount: string;
  eventDate: string;
  /** @nullable */
  payer?: string | null;
  status: string;
  clientKey: string;
  /** @nullable */
  evidence?: string | null;
  /** @nullable */
  accountCode?: string | null;
  /** @nullable */
  reason?: string | null;
  /** @nullable */
  journalEntryId?: number | null;
  /** @nullable */
  correctionReason?: string | null;
  /** @nullable */
  correctionEvidence?: string | null;
  /** @nullable */
  correctedBy?: number | null;
  /** @nullable */
  correctedAt?: string | null;
  /** @nullable */
  reversalEntryId?: number | null;
  /** @nullable */
  reviewedBy?: number | null;
  /** @nullable */
  reviewedAt?: string | null;
  createdAt: string;
}

export interface OwnerJournalDecisionInput {
  decision: OwnerJournalDecisionInputDecision;
  /** @minLength 1 */
  evidence: string;
  /** @minLength 1 */
  reason: string;
  entryDate: string;
}

export type OwnerJournalReportEntriesItem = {
  id: number;
  entryNumber: string;
  entryDate: string;
  description: string;
  /** @nullable */
  sourceType?: string | null;
  /** @nullable */
  sourceId?: string | null;
  status: string;
  debit: string;
  credit: string;
  projectedBalanceChangeIfReversed: string;
  /** @nullable */
  sourceDetail?: OwnerJournalReportEntriesItemSourceDetail;
  review?: OwnerJournalReview | null;
};

export const OwnerObligationInputRecurrence = {
  once: 'once',
  monthly: 'monthly',
} as const;

export type OwnerObligationEventInputKind = typeof OwnerObligationEventInputKind[keyof typeof OwnerObligationEventInputKind];
