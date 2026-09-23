import { useLanguage } from '@/hooks/use-language';
import { Money } from '@/components/money';

export default function Policy() {
  const { t, lang } = useLanguage();

  return (
    <div className="w-full bg-white min-h-screen">
      <div className="container mx-auto px-4 py-16 md:py-24 max-w-4xl">
        <h1 className="text-2xl md:text-3xl font-bold mb-10 text-black text-center">
          {t('سياساتنا', 'Our Policies')}
        </h1>

        <div className="space-y-8 text-gray-700 leading-loose">
          <section>
            <h3 className="text-xl font-bold text-black mb-4">{t('الشحن والتوصيل', 'Shipping and Delivery')}</h3>
            <ul className="list-disc list-inside space-y-2 rtl:pr-4 ltr:pl-4">
              <li>{t('يتم التوصيل خلال 5 أيام عمل كحد أقصى داخل المملكة العربية السعودية.', 'Delivery is within a maximum of 5 working days within Saudi Arabia.')}</li>
              <li>{t('يتم التوصيل خلال 10 أيام عمل كحد أقصى لدول مجلس التعاون الخليجي.', 'Delivery is within a maximum of 10 working days for GCC countries.')}</li>
               <li>{t('رسوم التوصيل داخل المملكة: ', 'Delivery fee within the Kingdom: ')}<Money value={28} lang={lang} />.</li>
               <li>{t('رسوم التوصيل لدول الخليج: ', 'Delivery fee to GCC countries: ')}<Money value={35} lang={lang} /> {t('لأول كيلو و ', 'for the first kilo and ')}<Money value={15} lang={lang} /> {t('لكل كيلو إضافي.', 'for each additional kilo.')}</li>
               <li>{t('توصيل مجاني للطلبات التي تبلغ ', 'Free delivery for orders of ')}<Money value={800} lang={lang} />{t(' فأكثر داخل المملكة.', ' or more within the Kingdom.')}</li>
               <li>{t('توصيل مجاني للطلبات التي تبلغ ', 'Free delivery for orders of ')}<Money value={1000} lang={lang} />{t(' فأكثر خارج المملكة.', ' or more outside the Kingdom.')}</li>
            </ul>
          </section>

          <section>
            <h3 className="text-xl font-bold text-black mb-4">{t('سياسة الإرجاع', 'Return Policy')}</h3>
            <ul className="list-disc list-inside space-y-2 rtl:pr-4 ltr:pl-4">
              <li>{t('يحق للعميل إرجاع المنتج خلال 3 أيام من تاريخ الفاتورة.', 'The customer has the right to return the product within 3 days from the invoice date.')}</li>
              <li>{t('يشترط أن يكون المنتج بحالته الأصلية ومغلقًا تمامًا مع إرفاق الفاتورة الأصلية.', 'The product must be in its original condition and completely sealed, with the original invoice attached.')}</li>
              <li>{t('لا يُقبل إرجاع أي منتج تم فتحه أو استخدامه، حفاظًا على جودة المنتجات العطرية.', 'No return is accepted for any product that has been opened or used, to preserve the quality of the aromatic products.')}</li>
            </ul>
          </section>

          <section>
            <h3 className="text-xl font-bold text-black mb-4">{t('سياسة الاستبدال', 'Exchange Policy')}</h3>
            <ul className="list-disc list-inside space-y-2 rtl:pr-4 ltr:pl-4">
              <li>{t('يحق للعميل استبدال المنتج خلال 7 أيام من تاريخ الفاتورة.', 'The customer has the right to exchange the product within 7 days from the invoice date.')}</li>
              <li>{t('بشرط أن يكون المنتج غير مستخدم ومغلقًا تمامًا مع إرفاق الفاتورة الأصلية.', 'Provided the product is unused and completely sealed, with the original invoice attached.')}</li>
               <li>{t('تُضاف رسوم استبدال بقيمة ', 'An exchange fee of ')}<Money value={4} lang={lang} />{t(' ورسوم توصيل ', ' and a delivery fee of ')}<Money value={25} lang={lang} />{t('.', '.')}</li>
            </ul>
          </section>

          <section>
            <h3 className="text-xl font-bold text-black mb-4">{t('ملاحظات عامة', 'General Notes')}</h3>
            <ul className="list-disc list-inside space-y-2 rtl:pr-4 ltr:pl-4">
              <li>{t('يُرجى التأكد من حالة الطلب فور استلامه.', 'Please check the condition of the order immediately upon receipt.')}</li>
              <li>{t('تحتفظ دار مسك اللولو بحق رفض أي طلب إرجاع أو استبدال لا يستوفي الشروط أعلاه.', 'Musk Ellolo reserves the right to reject any return or exchange request that does not meet the above conditions.')}</li>
              <li>{t('تطبّق هذه السياسة على الطلبات عبر الموقع الإلكتروني فقط.', 'This policy applies only to orders made via the website.')}</li>
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
}
