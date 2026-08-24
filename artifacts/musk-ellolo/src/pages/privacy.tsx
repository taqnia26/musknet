import { useLanguage } from '@/hooks/use-language';

export default function Privacy() {
  const { t } = useLanguage();

  return (
    <div className="w-full bg-white min-h-screen">
      <div className="container mx-auto px-4 py-16 md:py-24 max-w-4xl">
        <h1 className="text-2xl md:text-3xl font-bold mb-10 text-black text-center">
          {t('سياسة الخصوصية', 'Privacy Policy')}
        </h1>

        <div className="space-y-8 text-gray-700 leading-loose">
          <div>
            <h1 className="text-xl font-bold text-black mb-4">{t('سياسة الاستخدام والخصوصية', 'Terms of Use and Privacy Policy')}</h1>
          </div>

          <div>
            <h3 className="text-lg font-bold text-black mb-2">{t('الشروط :', 'Terms :')}</h3>
            <p className="mb-4">
              {t(
                'بدخولك إلى الموقع فأنت توافق على الإلتزام بهذه الشروط، وعلى جميع القوانين واللوائح المعمول بها، وتقر كذلك بأنك مسئول عن الإمتثال لأي قوانين محلية سارية .',
                'By accessing the site, you agree to be bound by these terms, and all applicable laws and regulations, and you also acknowledge that you are responsible for compliance with any applicable local laws.'
              )}
            </p>
            <p>
              {t(
                'إذا كنت لا توافق على أي من هذه الشروط، فلا يحق لك استخدام أو الدخول إلى هذا الموقع. جميع المواد الواردة في هذا الموقع محمية بموجب حقوق النشر المعمول بها وبموجب قانون حماية العلامات التجارية .',
                'If you do not agree with any of these terms, you are prohibited from using or accessing this site. All materials contained in this site are protected by applicable copyright and trademark law.'
              )}
            </p>
          </div>

          <div>
            <h3 className="text-lg font-bold text-black mb-2">{t('القانون المنظم :', 'Governing Law :')}</h3>
            <p>
              {t(
                'تخضع هذه الشروط والأحكام ويؤول تفسيرها إلى قوانين المملكة العربية السعودية وتخضع أنت كذلك وبشكل غير قابل للنقض للإختصاص القضائي لمحاكم المملكة العربية السعودية .',
                'These terms and conditions are governed by and construed in accordance with the laws of the Kingdom of Saudi Arabia and you irrevocably submit to the exclusive jurisdiction of the courts in the Kingdom of Saudi Arabia.'
              )}
            </p>
          </div>

          <div>
            <h3 className="text-lg font-bold text-black mb-2">{t('سياسة الخصوصية :', 'Privacy Policy :')}</h3>
            <p className="mb-4">
              {t(
                'تعتبر الخصوصية والأمن أقصى الأولويات في حيث أننا لم نقم على الإطلاق بمشاركة أو طباعة أو بيع معلومات أي زبون لأي طرف آخر .',
                'Privacy and security are the highest priorities, as we have never shared, printed or sold any customer\'s information to any other party.'
              )}
            </p>
            <p className="mb-4">
              {t(
                'عند قيامك بتقديم المعلومات الشخصية على موقعنا سنعمل بكل جهد على حماية معلوماتك على الإنترنت وخارجه .',
                'When you provide personal information on our site, we will work hard to protect your information online and offline.'
              )}
            </p>
            <p>
              {t(
                'نقوم باستخدام مجموعة متنوعة من تقنيات وإجراءات الأمان للمساعدة على حماية معلوماتك الشخصية من الوصول أو الاستخدام أو الكشف غير المصرح به حالما نقوم بإستلامها. على سبيل المثال، نحن نقوم بتخزين معلوماتك الشخصية على أنظمة كمبيوتر ذات وصول محدود لمصرح لهم بالإطلاع على هذه المعلومات ، ويتم تدريب موظفينا على التعامل الآمن مع هذه المعلومات والبيانات وإبقائهم مطلعين على آخر المستجدات التي تتعلق بالإجراءات الأمنية .',
                'We use a variety of security technologies and procedures to help protect your personal information from unauthorized access, use, or disclosure once we receive it. For example, we store your personal information on computer systems with limited access to those authorized to view this information, and our employees are trained in the safe handling of this information and data and kept up to date on the latest security procedures.'
              )}
            </p>
          </div>

          <div>
            <h3 className="text-lg font-bold text-black mb-2">{t('خصوصية حسابك :', 'Your Account Privacy :')}</h3>
            <p className="mb-4">
              {t(
                'أنت مسؤول عن الحفاظ على سرية بيانات حسابك وكلمة المرور وتحديد من يصل إلى جهاز الكمبيوتر الخاص بك أو التطبيق الخاص بنا ، كما أنك توافق على قبول المسؤولية عن جميع الأنشطة التي تتم من خلال حسابك أو كلمة المرور الخاصة بكإذا كان عمرك أقل من 18 سنة، فلا يجوز لك استخدام خدمات إلا بإشراك أحد الوالدين أو ولي الأمر .',
                'You are responsible for maintaining the confidentiality of your account details and password and determining who accesses your computer or our application, and you agree to accept responsibility for all activities that occur under your account or password. If you are under 18 years old, you may only use the services with the involvement of a parent or guardian.'
              )}
            </p>
            <p>
              {t(
                'نحتفظ بالحق في رفض تقديم الخدمة، أو إنهاء الحسابات، أو إزالة أو تعديل المحتوى، أو إلغاء الأوامر وفقا للتقدير الخاص .',
                'We reserve the right to refuse service, terminate accounts, remove or edit content, or cancel orders in our sole discretion.'
              )}
            </p>
          </div>

          <div>
            <h3 className="text-lg font-bold text-black mb-2">{t('سياسة التوصيل :', 'Delivery Policy :')}</h3>
            <p className="mb-4">
              {t(
                'عندما يتم التوصيل سيطلب منك توقيعك إلكترونياً أو توقيعك على نسخة الفاتورة وهذا التوقيع يكون بمثابة تأكيد أنك إستلمت المنتجات كاملة كما هو مبين في الفاتورة .',
                'When delivery is made you will be asked to sign electronically or sign the invoice copy and this signature serves as confirmation that you have received the products in full as shown on the invoice.'
              )}
            </p>
            <p>
              {t(
                'إن لم تكن متواجد في العنوان المحدد سنقوم بتسليم الطلب لأى شخص متواجد بهذا العنوان وتوقيعه على الفاتورة إلكترونياً أوعلى نسخة الفاتوره ، وعند توقيع أى شخص من الموجودين فى العنوان على طلب التوصيل يعتبر أن العميل قد استلم الأغراض الموجوده بالفاتورةإذا تم الوصول الى العنوان المحدد من قبلك ولم نستطيع تسليم الطلب يرجى الإتصال بخدمة العملاء لتحديد موعد آخر لتوصيل الطلب. الشركة غير مسؤولة عن أيه طلب لم يتم توصيله خلال 30 يوم من تاريخ الطلب .',
                'If you are not present at the specified address, we will deliver the order to anyone present at this address and have them sign the invoice electronically or on the invoice copy. When anyone present at the address signs the delivery order, it is considered that the customer has received the items on the invoice. If the specified address is reached and we are unable to deliver the order, please contact customer service to schedule another time to deliver the order. The company is not responsible for any order that is not delivered within 30 days from the date of the order.'
              )}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
