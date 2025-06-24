// ✅ server.js - 10 oyuncuya kadar destekleyen, tekrar etmeyen harfli Socket.IO sunucusu

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
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

let oyuncular = [];
let hazirOyuncular = [];
let cevaplarListesi = {}; // { socket.id: { isim, cevaplar } }
let kullanilanHarfler = [];

// 🔤 Harf seçimi - tekrar etmeyecek
function rastgeleHarfSec() {
  const harfler = [..."ABCÇDEFGHIİJKLMNOÖPRSŞTUÜVYZ"];
  const kalan = harfler.filter((h) => !kullanilanHarfler.includes(h));

  if (kalan.length === 0) {
    kullanilanHarfler = []; // yeniden başlat
  }

  const secimListesi = kalan.length > 0 ? kalan : harfler;
  const secilen = secimListesi[Math.floor(Math.random() * secimListesi.length)];
  kullanilanHarfler.push(secilen);
  return secilen;
}

io.on("connection", (socket) => {
  console.log("🔌 Yeni bağlantı:", socket.id);

  socket.on("yeniOyuncu", (isim) => {
    socket.data.isim = isim;
    oyuncular.push({ id: socket.id, isim });
    console.log("➕ Yeni Oyuncu:", isim);

    io.emit("oyuncuListesi", oyuncular.map((o) => o.isim));

    if (oyuncular.length >= 2 && oyuncular.length <= 10) {
      io.emit("oyunaBasla");
    }
  });

  socket.on("hazir", () => {
    if (!hazirOyuncular.includes(socket.id)) {
      hazirOyuncular.push(socket.id);
    }

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
      // Her oyuncunun cevabı geldiyse karşılaştır ve puanla
      const cevapKopyasi = { ...cevaplarListesi };
      Object.entries(cevapKopyasi).forEach(([id, { isim, cevaplar }]) => {
        const digerleri = Object.entries(cevapKopyasi).filter(
          ([digerId]) => digerId !== id
        );

        let puanlar = {};
        let toplam = 0;

        ["isim", "şehir", "hayvan", "bitki", "eşya"].forEach((kat) => {
          const benim = (cevaplar[kat] || "").toLowerCase().trim();
          if (!benim) {
            puanlar[kat] = 0;
            return;
          }

          const ayniCevapVar = digerleri.some(
            ([_, { cevaplar: r }]) => (r[kat] || "").toLowerCase().trim() === benim
          );

          puanlar[kat] = ayniCevapVar ? 5 : 10;
          toplam += puanlar[kat];
        });

        // Bir kişiye gönder
        const rakip = digerleri.map(([_, r]) => ({ isim: r.isim, cevaplar: r.cevaplar }));
        io.to(id).emit("puanSonucu", {
          benim: cevaplar,
          rakip: rakip[0] || {},
          puanlar,
          toplam,
          rakipToplam: 0,
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
      console.log("❌ Ayrıldı:", oyuncu.isim);
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 Sunucu aktif: http://localhost:${PORT}`);
});
