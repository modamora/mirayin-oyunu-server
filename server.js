const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");
const fs = require("fs");
const path = require("path");

const app = express();
app.use(cors());

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] },
});

const kelimeKategorileri = ["isimler", "sehirler", "hayvanlar", "bitkiler", "esyalar"];
const kelimeListeleri = {};
kelimeKategorileri.forEach((kategori) => {
  const filePath = path.join(__dirname, "kelimeler", `${kategori}.txt`);
  const veriler = fs.readFileSync(filePath, "utf8")
    .split("\n")
    .map((x) => x.trim().toLowerCase())
    .filter((x) => x);
  kelimeListeleri[kategori] = new Set(veriler);
});

const odalar = {}; // oda adı: { oyuncular: [], hazirOyuncular: [], cevaplarListesi: {}, kullanilanHarfler: [] }

function odaListesiniYay() {
  const aktifOdalar = Object.entries(odalar).map(([odaAdi, odaData]) => ({
    oda: odaAdi,
    oyuncuSayisi: odaData.oyuncular.length,
  }));
  io.emit("odaListesi", aktifOdalar);
}

function rastgeleHarfSec(kullanilanlar) {
  const harfler = [..."ABCÇDEFGHIİJKLMNOÖPRSŞTUÜVYZ"];
  const kalan = harfler.filter((h) => !kullanilanlar.includes(h));
  if (kalan.length === 0) kullanilanlar.length = 0;
  const secilen = kalan[Math.floor(Math.random() * kalan.length)];
  kullanilanlar.push(secilen);
  return secilen;
}

io.on("connection", (socket) => {
  console.log("🔌 Bağlantı:", socket.id);

  socket.on("yeniOyuncu", ({ isim, oda, kapasite }) => {
    socket.data.isim = isim;
    socket.data.oda = oda;

    if (!odalar[oda]) {
      odalar[oda] = {
        oyuncular: [],
        hazirOyuncular: [],
        cevaplarListesi: {},
        kullanilanHarfler: [],
        kapasite: kapasite || 0,
      };
    }

    const odaData = odalar[oda];

    if (
      odaData.kapasite > 0 &&
      odaData.oyuncular.length >= odaData.kapasite
    ) {
      socket.emit("odaKapasiteDoldu");
      return;
    }

    odaData.oyuncular.push({ id: socket.id, isim });
    socket.join(oda);

    console.log(`👤 ${isim} ${oda} odasına katıldı`);
    io.to(oda).emit("oyuncuListesi", odaData.oyuncular.map(o => o.isim));
    odaListesiniYay();
  });

  socket.on("hazir", () => {
    const oda = socket.data.oda;
    const odaData = odalar[oda];
    if (!odaData) return;

    if (!odaData.hazirOyuncular.includes(socket.id)) {
      odaData.hazirOyuncular.push(socket.id);
    }

    // Artık otomatik başlatılmaz, kurucu manuel başlatır
  });

  socket.on("oyunuBaslat", () => {
    const oda = socket.data.oda;
    const odaData = odalar[oda];
    if (!odaData) return;

    if (odaData.hazirOyuncular.length === odaData.oyuncular.length) {
      const harf = rastgeleHarfSec(odaData.kullanilanHarfler);
      io.to(oda).emit("harf", harf);
      odaData.hazirOyuncular = [];
      odaData.cevaplarListesi = {};
    } else {
      io.to(socket.id).emit("mesaj", "Tüm oyuncular hazır değil.");
    }
  });

  socket.on("cevaplar", (veri) => {
    const oda = socket.data.oda;
    const odaData = odalar[oda];
    if (!odaData) return;

    odaData.cevaplarListesi[socket.id] = {
      isim: veri.isim,
      cevaplar: veri.cevaplar,
    };

    if (Object.keys(odaData.cevaplarListesi).length === odaData.oyuncular.length) {
      const herkeseSonuclar = {};

      Object.entries(odaData.cevaplarListesi).forEach(([id, { isim, cevaplar }]) => {
        let puanlar = {};
        let toplam = 0;
        const harf = odaData.kullanilanHarfler.slice(-1)[0].toLowerCase();

        ["isim", "şehir", "hayvan", "bitki", "eşya"].forEach((kat) => {
          const cevap = (cevaplar[kat] || "").trim().toLowerCase();
          const kategoriKey = kat === "şehir" ? "sehirler" : kat === "eşya" ? "esyalar" : `${kat}ler`;
          const gecerli = cevap.startsWith(harf) && kelimeListeleri[kategoriKey].has(cevap);
          const ayni = Object.entries(odaData.cevaplarListesi).some(
            ([digerId, diger]) =>
              digerId !== id &&
              (diger.cevaplar[kat] || "").trim().toLowerCase() === cevap
          );
          const puan = gecerli ? (ayni ? 5 : 10) : 0;
          puanlar[kat] = puan;
          toplam += puan;
        });

        herkeseSonuclar[id] = { isim, cevaplar, puanlar, toplam };
      });

      Object.entries(herkeseSonuclar).forEach(([id, ben]) => {
        const tumPuanlar = Object.values(herkeseSonuclar).map((o) => ({
          isim: o.isim,
          toplam: o.toplam,
        }));

        io.to(id).emit("puanSonucu", {
          benim: ben.cevaplar,
          puanlar: ben.puanlar,
          toplam: ben.toplam,
          tumPuanlar,
        });
      });

      odaData.cevaplarListesi = {};
    }
  });

  socket.on("disconnect", () => {
    const oda = socket.data.oda;
    const odaData = odalar[oda];
    if (!odaData) return;

    const oyuncu = odaData.oyuncular.find((o) => o.id === socket.id);
    if (oyuncu) {
      odaData.oyuncular = odaData.oyuncular.filter((o) => o.id !== socket.id);
      odaData.hazirOyuncular = odaData.hazirOyuncular.filter((id) => id !== socket.id);
      delete odaData.cevaplarListesi[socket.id];

      io.to(oda).emit("oyuncuListesi", odaData.oyuncular.map(o => o.isim));
      io.to(oda).emit("mesaj", `${oyuncu.isim} oyundan ayrıldı`);

      if (odaData.oyuncular.length === 0) {
        delete odalar[oda];
      }

      odaListesiniYay();
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 Sunucu aktif: http://localhost:${PORT}`);
});
