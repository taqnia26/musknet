import * as z from 'zod';

export const normalizePhone = (value: string) => value.trim()
  .replace(/[٠-٩]/g, (digit) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit)))
  .replace(/[۰-۹]/g, (digit) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(digit)))
  .replace(/[\u200E\u200F\u202A-\u202E\u2066-\u2069]/g, '');

const emailSchema = z.union([z.literal(''), z.string().email('أدخل بريداً إلكترونياً صالحاً / Enter a valid email address')]);
const nameSchema = z.string().trim().min(1, 'الاسم مطلوب / Name is required');
export const createCustomerSchema = z.object({
  name: nameSchema,
  phone: z.string().refine((value) => {
    const phone = normalizePhone(value);
    return /^\+?[\d\s().-]+$/.test(phone) && /^\d{8,15}$/.test(phone.replace(/\D/g, ''));
  }, 'أدخل رقم هاتف من 8 إلى 15 رقماً / Enter a phone number with 8–15 digits'),
  email: emailSchema,
});
export const editCustomerSchema = z.object({ name: nameSchema, email: emailSchema, isActive: z.boolean() });
export type CreateCustomerValues = z.infer<typeof createCustomerSchema>;
export type EditCustomerValues = z.infer<typeof editCustomerSchema>;

export const customerPayload = (data: CreateCustomerValues) => ({
  name: data.name.trim(),
  phone: normalizePhone(data.phone).replace(/\D/g, ''),
  email: data.email.trim() || null,
});

export function customerCreateError(error: unknown, fallback: string, duplicateMessage: string) {
  const cause = error as { status?: number; data?: { error?: string } };
  return cause.status === 409 ? duplicateMessage : cause.data?.error ?? fallback;
}