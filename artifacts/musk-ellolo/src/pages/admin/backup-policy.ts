/** Localized explanations for the server's versioned backup policy. */
export function arabicBackupPolicy(policy: string): string {
  const explanations: [string, string][] = [
    ['Production schema and migrations', 'لا تُستعاد بنية قاعدة البيانات أو ملفات تحديثها؛ يجب أن تتوافق بنية النسخة مع البنية الحالية قبل الاستعادة.'],
    ['backup_* control/history', 'تبقى سجلات النسخ وإعدادات الأمان وكلمات مرور الإدارة والمالك الحالية دون استبدال. إعدادات الفوترة والبيانات التجارية مشمولة.'],
    ['Ephemeral admin/owner/influencer', 'لا تشمل النسخة جلسات الدخول المؤقتة ورموز التحقق؛ تُمسح عند الاستعادة ويلزم تسجيل الدخول مجددًا.'],
    ['Current external-provider', 'تبقى سجلات الإرسال والشحن والعمليات الخارجية الحالية محفوظة. تُوقف العمليات المعلقة لمنع إرسال أو تنفيذ العملية نفسها مرة أخرى.'],
    ['Dedicated external invoice-number', 'تبقى عدادات أرقام الفواتير الحالية دون تخفيض، حتى لا يتكرر رقم سبق إصداره.'],
    ['The max-based tax-invoice', 'تُحفظ أعلى أرقام الفواتير الضريبية الصادرة بصورة مستقلة؛ استعادة نسخة قديمة لا تعيد استخدام تلك الأرقام.'],
    ['WhatsApp auth/session/secrets', 'تبقى بيانات ربط واتساب ومفاتيحه الحالية محفوظة ولا تُستبدل ببيانات قديمة.'],
    ['App Storage backups/', 'لا تُنسخ ملفات النسخ الاحتياطية نفسها داخل نسخة جديدة.'],
    ['Every configured PRIVATE_OBJECT_DIR', 'تشمل الملفات جميع مساحات التخزين العامة والخاصة المهيأة، والعقود المحلية عند تهيئتها، والوسائط وملفات الموقع المرفوعة.'],
    ['Source code, environment files', 'لا تشمل النسخة كود التطبيق أو الأسرار ومتغيرات البيئة أو ملفات Git والحزم أو الملفات خارج مساحات التخزين المهيأة.'],
  ];
  return explanations.find(([prefix]) => policy.startsWith(prefix))?.[1] ?? policy;
}