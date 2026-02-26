export const commerceConfig = {
  brandName: "IDA SISUSTUSPOOD & STUUDIO",
  currencySymbol: "€",
  freeShippingThreshold: 0,
  discountThresholds: [] as Array<{ subtotal: number; discountPct: number }>,
  supportEmail: "info@idastuudio.ee",
  supportPhone: "+372 5623 0614",
  supportPhoneAlt: "",
  supportHours: "E-R 10:00-17:00",
  companyName: "TISLER DESIGNS OÜ",
  companyReg: "14106877",
  address: "IDA 7a, 93811 Kuressaare, Saaremaa",
  showroomAddress: "Kalevi 28, Kuressaare (Ringtee keskus)",
  storeBaseUrl: "https://idastuudio.ee",
  links: {
    shipping: "/myygitingimused/",
    returns: "/myygitingimused/",
    contact: "/",
    warranty: "/myygitingimused/",
    salesTerms: "/myygitingimused/",
    paymentMethods: "/myygitingimused/",
    privacy: "/andmekaitsetingimused/",
    withdrawalForm: "/myygitingimused/",
    aboutUs: "/",
    cart: "/ostukorv/"
  }
};

export const storeKnowledge = {
  shipping: {
    summary:
      "Tarnehind lisandub vastavalt valitud tarneviisile (Itella SmartPOST, Omniva, kuller).",
    deliveryInStock: "Laos olevad tooted jõuavad kohale tavaliselt 1-3 tööpäevaga.",
    deliveryBackorder: "Järeltellitavate toodete tarneaeg on 1-30 nädalat.",
    mixedOrder:
      "Kui tellimuses on koos laotooted ja järeltellitavad tooted, postitatakse tellimus siis, kui kõik tooted on laos olemas.",
    note:
      "Kui soovid laos olevad tooted kohe kätte saada eraldi saadetisena, kirjuta info@idastuudio.ee (postikulu lisandub)."
  },
  returns: {
    withdrawalPeriod: "Taganemisõigus tarbijale on 14 päeva kauba kättesaamisest.",
    howTo:
      "Tagastamisavaldus tuleb saata vabas vormis aadressile info@idastuudio.ee (koos nime, toote nime ja tellimuse numbriga).",
    returnShipping:
      "Tagastamiskulud kannab klient, v.a. defektse kauba puhul. Ärikliendile 14-päevane taganemisõigus ei kohaldu.",
    refundTime: "Tagasimakse tehakse hiljemalt 14 päeva jooksul taganemisavalduse kättesaamisest.",
    condition:
      "Tagastatav kaup peab olema kasutamata, kahjustamata ja originaalpakendis.",
    exceptions:
      "Järeltellitavate toodete loobumisel võivad rakenduda brändipõhised kulud vastavalt müügitingimustele."
  },
  warranty: {
    summary:
      "Pretensioon tuleb esitada e-postile info@idastuudio.ee koos kirjeldusega ning vajadusel fotodega.",
    transportDamage:
      "Transpordikahjustusest tuleb teavitada esimesel võimalusel, kuid mitte hiljem kui 3 päeva jooksul kauba kättesaamisest.",
    claimWindow:
      "Müügitingimustes on pretensioonide esitamise korras välja toodud 14 päeva alates kauba kättesaamisest.",
    contact: "Pretensioonide kontakt: info@idastuudio.ee, telefon +372 5623 0614."
  },
  payment: {
    methods: [
      "Tasumine toimub tellimuse vormistamisel valitud makseviisi kaudu",
      "Müügileping jõustub pärast makse laekumist",
      "Tarnevõimalused: Itella SmartPOST, Omniva, kuller"
    ],
    note: "Täpsed makse- ja tarneviisid kuvatakse kassas tellimuse vormistamisel."
  },
  about: {
    description:
      "IDA on Eesti sisustuspood, kus on lai valik mööblit, valgusteid, vaipu ja koduaksessuaare erinevates hinnaklassides.",
    location:
      "Füüsiline stuudiopood asub Kuressaares aadressil Kalevi 28 (Ringtee keskuses)."
  },
  privacy: {
    summary:
      "Isikuandmete töötlemise alused ja õigused on kirjeldatud andmekaitsetingimustes.",
    rights:
      "Andmesubjektil on õigus andmetega tutvuda, neid parandada ja pöörduda klienditoe poole: info@idastuudio.ee."
  },
  contact: {
    email: "info@idastuudio.ee",
    phone: "+372 5623 0614",
    hours: "E-R 10:00-17:00",
    legalAddress: "IDA 7a, 93811 Kuressaare, Saaremaa",
    showroomAddress: "Kalevi 28, Kuressaare (Ringtee keskus)"
  }
};

export const buildKnowledgeBlock = (): string => {
  const k = storeKnowledge;
  return `
ETTEVÕTTE ANDMED:
- Nimi: ${commerceConfig.brandName} (${commerceConfig.companyName}, reg ${commerceConfig.companyReg})
- Juriidiline aadress: ${k.contact.legalAddress}
- Stuudiopood: ${k.contact.showroomAddress}
- E-post: ${k.contact.email}
- Telefon: ${k.contact.phone}
- Tööaeg: ${k.contact.hours}

KOHALETOIMETAMINE:
- ${k.shipping.summary}
- ${k.shipping.deliveryInStock}
- ${k.shipping.deliveryBackorder}
- ${k.shipping.mixedOrder}
- ${k.shipping.note}

TAGASTAMINE:
- ${k.returns.withdrawalPeriod}
- ${k.returns.howTo}
- ${k.returns.returnShipping}
- ${k.returns.refundTime}
- ${k.returns.condition}
- ${k.returns.exceptions}

PRETENSIOONID / GARANTII:
- ${k.warranty.summary}
- ${k.warranty.transportDamage}
- ${k.warranty.claimWindow}
- ${k.warranty.contact}

MAKSE JA TARNED:
${k.payment.methods.map((m) => `- ${m}`).join("\n")}
- ${k.payment.note}

ETTEVÕTTEST:
- ${k.about.description}
- ${k.about.location}

PRIVAATSUS:
- ${k.privacy.summary}
- ${k.privacy.rights}
`.trim();
};

export const faqEntries: Array<{ keywords: string[]; answer: string }> = [
  {
    keywords: ["tarne", "shipping", "kohaletoimetamine", "laos", "järeltellitav", "jareltellitav"],
    answer:
      "Laos olevate toodete tarneaeg on tavaliselt 1-3 tööpäeva. Järeltellitavate toodete tarneaeg on 1-30 nädalat. Kui tellimuses on mõlemad koos, saadetakse kaup siis, kui kõik tooted on laos olemas."
  },
  {
    keywords: ["tagastus", "tagastamine", "returns", "refund", "taganemine", "raha tagasi"],
    answer:
      "Tarbijal on 14-päevane taganemisõigus kauba kättesaamisest. Tagastamisavaldus saada aadressile info@idastuudio.ee. Tagastamiskulud kannab üldjuhul klient, v.a. defektse kauba puhul."
  },
  {
    keywords: ["garantii", "pretensioon", "defekt", "katki", "reklamatsioon", "warranty"],
    answer:
      "Pretensioonide korral kirjuta info@idastuudio.ee ja lisa toote puuduse kirjeldus. Transpordikahjustusest palume teavitada esimesel võimalusel, kuid mitte hiljem kui 3 päeva jooksul kauba kättesaamisest."
  },
  {
    keywords: ["kontakt", "telefon", "email", "e-post", "klienditugi", "support"],
    answer:
      "Kontakt: info@idastuudio.ee, telefon +372 5623 0614. Stuudiopood asub Kuressaares aadressil Kalevi 28 (Ringtee keskus)."
  },
  {
    keywords: ["makse", "maksmine", "kassa", "pangalink", "ülekanne", "tarneviis"],
    answer:
      "Tellimuse vormistamisel saad valida sobiva makse- ja tarneviisi. Tarnepartnerid on Itella SmartPOST, Omniva ja kuller. Müügileping jõustub pärast makse laekumist."
  },
  {
    keywords: ["privaatsus", "isikuandmed", "andmekaitse", "gdpr", "privacy"],
    answer:
      "Isikuandmete töötlemise tingimused on kirjeldatud andmekaitsetingimustes. Õiguste teostamiseks saab pöörduda aadressile info@idastuudio.ee."
  },
  {
    keywords: ["meist", "kes te olete", "ettevõte", "firma"],
    answer:
      "IDA SISUSTUSPOOD & STUUDIO on Eesti sisustuspood, kus on lai valik mööblit, valgusteid, vaipu ja koduaksessuaare. Füüsiline stuudiopood asub Kuressaares."
  },
  {
    keywords: ["tingimused", "müügitingimused", "muugitingimused", "leping"],
    answer:
      "Müügitingimused, tarne, tagastuse ja pretensioonide kord on kirjas lehel /myygitingimused/."
  }
];
