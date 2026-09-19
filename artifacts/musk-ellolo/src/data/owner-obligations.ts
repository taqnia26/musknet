export type ObligationDetailRow = {
  name: string;
  amount?: number;
  paid?: number;
  remaining?: number;
  paymentAccount?: string;
  due?: string;
};

export const recurringObligations = {
  title: 'التزامات شهريه وسنوية',
  rows: [
    { name: 'ستورج ستيشن' },
    { name: 'اشتراك الايميلات ', amount: 216.13 },
    { name: 'راتب المحاسب' },
    { name: 'راتب هيا' },
    { name: 'المصمم' },
    { name: 'فاتورة جوال مسك', amount: 20 },
    { name: 'فاتورة جوال هيا', amount: 371 },
    { name: 'رسوم اشتراك سلة برو' },
    { name: 'ضيافة اجتماعات' },
    { name: 'صدقة مبيعات شهرية' },
    { name: 'اشتراك هيئة الترقيم' },
  ],
  total: 236.13,
};

export const immediateObligations: { title: string; rows: ObligationDetailRow[] } = {
  title: 'التزامات فورية 1-3شهور',
  rows: [
    { name: 'فاتورة زيت رويال مسك', amount: 10120, paymentAccount: 'مسك اللولو', due: 'فوري' },
    { name: 'محمود المحاسب', amount: 1000, paymentAccount: 'مسك اللولو', due: 'فوري' },
    { name: 'فاتورة جوال هياء', amount: 371, paymentAccount: 'مسك اللولو', due: 'شهري' },
    { name: 'اشتراك الايميلات', amount: 216.13, paymentAccount: 'مسك اللولو', due: ' تسحب من البنك شهري' },
    { name: 'راتب هياء', paymentAccount: 'مسك اللولو', due: 'شهري' },
    { name: 'راتب المحاسب', paymentAccount: 'مسك اللولو', due: 'شهري' },
    { name: 'فاتورة المصمم كارين', paymentAccount: 'مسك اللولو', due: 'شهري' },
    { name: 'ضيافة اجتماعات', paymentAccount: 'مسك اللولو', due: 'فوري' },
    { name: 'صدقة مبيعات شهريه', paymentAccount: 'مسك اللولو', due: 'شهري' },
    { name: 'تكاليف تسويق', paymentAccount: 'مسك اللولو', due: 'شهري' },
    { name: 'فاتورة ستورج ستيشن', paymentAccount: 'مسك اللولو', due: 'كل شهرين' },
    { name: 'رايات نجد', amount: 20000, paymentAccount: 'مسك اللولو', due: 'خلال 3 أشهر' },
    { name: 'أمي', amount: 5000, paymentAccount: 'مسك اللولو', due: 'خلال 3 أشهر' },
    { name: 'متعب', amount: 46625, paid: 10000, paymentAccount: 'كورنرز', due: 'خلال 3 أشهر' },
    { name: 'ملاك', amount: 200000, paymentAccount: 'كورنرز', due: 'كل 3أشهر' },
    { name: 'عبدالله', amount: 127799, paid: 5000, paymentAccount: 'مسك اللولو', due: 'كل 3أشهر' },
  ],
};

export const annualObligations: { title: string; rows: ObligationDetailRow[] } = {
  title: 'التزامات سنوية ',
  rows: [
    { name: 'مصاريف حكومية', amount: 1404, paymentAccount: 'مسك اللولو', due: 'سنوي' },
    { name: 'هيئة الترقيم السعودي', due: 'سنوي' },
    { name: 'تكاليف الموقع الالكتروني', due: 'سنوي' },
  ],
};

export const thirdPartyRights = {
  title: 'التزام(حقوق للغير ،حقوق للموظفين ،حقوق للغير )',
  rows: [] as Array<{ name: string; amount?: number }>,
  total: 0,
};

export const unnamedNameAmountRows = [
  { name: 'متعب', amount: 46625 },
  { name: 'عبدالله', amount: 127799 },
  { name: 'ملاك ', amount: 200000 },
];

export const trailingObligationRows = [
  { name: 'سعر البيع النهائي ' },
];

export const debts: { title: string; rows: ObligationDetailRow[] } = {
  title: 'مديونيات',
  rows: [
    { name: 'المحامي', amount: 115000, paymentAccount: 'كورنرز' },
    { name: 'روان', amount: 200000, paymentAccount: 'كورنرز' },
    { name: 'الوالدة', amount: 24045, paymentAccount: 'كورنرز' },
    { name: 'الوالد', amount: 315000, paymentAccount: 'كورنرز' },
    { name: 'الوالد-شركة الغاز', amount: 345000, paymentAccount: 'كورنرز' },
  ],
};