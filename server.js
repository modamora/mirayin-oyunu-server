// ✅ server.js - 10 oyunculu, tekrar etmeyen harfli, kelime kontrolü yapan, oyuncu çıkışı ve internet güncellemesi destekli

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

let oyuncular = [];
let hazirOyuncular = [];
let cevaplarListesi = {}; // { socket.id: { isim, cevaplar } }
let kullanilanHarfler = [];

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

function rastgeleHarfSec() {
  const harfler = [..."ABCÇDEFGHIİJKLMNOÖPRSŞTUÜVYZ"];
  const kalan = harfler.filter((h) => !kullanilanHarfler.includes(h));
  if (kalan.length === 0) kullanilanHarfler = [];
  const secilen = kalan[Math.floor(Math.random() * kalan.length)];
  kullanilanHarfler.push(secilen);
  return secilen;
}

io.on("connection", (socket) => {
  console.log("🔌 Bağlandı:", socket.id);

  socket.on("yeniOyuncu", (isim) => {
    socket.data.isim = isim;
    oyuncular.push({ id: socket.id, isim });
    console.log("👤 Katılan:", isim);
    io.emit("oyuncuListesi", oyuncular.map((o) => o.isim));
    if (oyuncular.length >= 2 && oyuncular.length <= 10) {
      io.emit("oyunaBasla");
    }
  });

  socket.on("hazir", () => {
    if (!hazirOyuncular.includes(socket.id)) hazirOyuncular.push(socket.id);
    if (hazirOyuncular.length === oyuncular.length) {
      const harf = rastgeleHarfSec();
      io.emit("harf", harf);
      hazirOyuncular = [];
    }
  });

  socket.on("cevaplar", (veri) => {
    cevaplarListesi[socket.id] = {
      isim: veri.isim,
      cevaplar: veri.cevaplar,
    };

    if (Object.keys(cevaplarListesi).length === oyuncular.length) {
      const herkeseSonuclar = {};

      Object.entries(cevaplarListesi).forEach(([id, { isim, cevaplar }]) => {
        let puanlar = {};
        let toplam = 0;

        ["isim", "şehir", "hayvan", "bitki", "eşya"].forEach((kat) => {
          const cevap = (cevaplar[kat] || "").trim().toLowerCase();
          const basHarf = kullanilanHarfler[kullanilanHarfler.length - 1].toLowerCase();
          const kategoriKey = kat === "şehir" ? "sehirler" : kat === "eşya" ? "esyalar" : `${kat}ler`;
          const gecerli = cevap.startsWith(basHarf) && kelimeListeleri[kategoriKey].has(cevap);

          const ayni = Object.entries(cevaplarListesi).some(
            ([digerId, diger]) =>
              digerId !== id && (diger.cevaplar[kat] || "").trim().toLowerCase() === cevap
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

      cevaplarListesi = {};
    }
  });

  socket.on("disconnect", () => {
    const oyuncu = oyuncular.find((o) => o.id === socket.id);
    if (oyuncu) {
      oyuncular = oyuncular.filter((o) => o.id !== socket.id);
      hazirOyuncular = hazirOyuncular.filter((id) => id !== socket.id);
      delete cevaplarListesi[socket.id];
      io.emit("oyuncuListesi", oyuncular.map((o) => o.isim));
      io.emit("mesaj", `${oyuncu.isim} oyundan ayrıldı`);
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 Sunucu aktif: http://localhost:${PORT}`);
});
