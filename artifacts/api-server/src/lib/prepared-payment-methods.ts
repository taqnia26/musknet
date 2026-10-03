// Prepared fields only. Provider setup and checkout activation need explicit approval.
// Adding credentials must not silently make a method available.
export const preparedCheckoutPaymentMethods = [
  { id: "apple_pay", name: "Apple Pay", description: "خانة مجهزة؛ الربط لم يُفعّل بعد", available: false },
  { id: "tabby", name: "تابي", description: "خانة مجهزة؛ الربط لم يُفعّل بعد", available: false },
  { id: "tamara", name: "تمارا", description: "خانة مجهزة؛ الربط لم يُفعّل بعد", available: false },
  { id: "bank-transfer", name: "تحويل بنكي", description: "خانة مجهزة؛ مسار إتمام الشراء لم يُفعّل بعد", available: false },
  { id: "cash", name: "الدفع عند الاستلام", description: "خانة مجهزة؛ مسار إتمام الشراء لم يُفعّل بعد", available: false },
] as const;