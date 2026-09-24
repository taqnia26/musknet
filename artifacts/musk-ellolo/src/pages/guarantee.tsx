export default function Guarantee() {
  return (
    <section className="min-h-[58vh] bg-white" aria-labelledby="guarantee-title" dir="rtl">
      <div className="container mx-auto px-4 pb-12 pt-10">
        <div className="mx-auto mt-4 w-full rounded bg-white p-6 lg:mt-12 lg:w-10/12 lg:p-8">
          <h1 id="guarantee-title" className="mb-6 text-2xl font-bold">الضمان</h1>
          <img
            src={`${import.meta.env.BASE_URL}site-assets/guarantee-certificate.jpg`}
            alt="شهادة مسك اللولو الأصلية للتصميم الحصري ووجود لؤلؤة داخل الزجاجة"
            width={1280}
            height={882}
            className="mx-auto block h-auto w-full max-w-full"
          />
        </div>
      </div>
    </section>
  );
}
