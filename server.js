// ✅ GÜNCELLENMİŞ server.js - Tüm oyuncuların puanları ve kelime doğrulaması eklenmiş

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
let cevaplarListesi = {};
let kullanilanHarfler = [];

// ✔️ Kelime listelerini oku
const kelimeler = {
  isim: new Set(fs.readFileSync(path.join(__dirname, "kelimeler/isimler.txt"), "utf-8").split(/\r?\n/).map(s => s.trim().toLowerCase())),
  şehir: new Set(fs.readFileSync(path.join(__dirname, "kelimeler/sehirler.txt"), "utf-8").split(/\r?\n/).map(s => s.trim().toLowerCase())),
  hayvan: new Set(fs.readFileSync(path.join(__dirname, "kelimeler/hayvanlar.txt"), "utf-8").split(/\r?\n/).map(s => s.trim().toLowerCase())),
  bitki: new Set(fs.readFileSync(path.join(__dirname, "kelimeler/bitkiler.txt"), "utf-8").split(/\r?\n/).map(s => s.trim().toLowerCase())),
  eşya: new Set(fs.readFileSync(path.join(__dirname, "kelimeler/esyalar.txt"), "utf-8").split(/\r?\n/).map(s => s.trim().toLowerCase())),
};

function rastgeleHarfSec() {
  const harfler = [..."ABCÇDEFGHIİJKLMNOÖPRSŞTUÜVYZ"];
  const kalan = harfler.filter((h) => !kullanilanHarfler.includes(h));
  if (kalan.length === 0) kullanilanHarfler = [];
  const secimListesi = kalan.length > 0 ? kalan : harfler;
  const secilen = secimListesi[Math.floor(Math.random() * secimListesi.length)];
  kullanilanHarfler.push(secilen);
  return secilen;
}

io.on("connection", (socket) => {
  socket.on("yeniOyuncu", (isim) => {
    socket.data.isim = isim;
    oyuncular.push({ id: socket.id, isim });
    io.emit("oyuncuListesi", oyuncular.map(o => o.isim));
    if (oyuncular.length >= 2 && oyuncular.length <= 10) io.emit("oyunaBasla");
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
      const tumPuanlar = {};

      for (const [id, { isim, cevaplar }] of Object.entries(cevaplarListesi)) {
        let puanlar = {};
        let toplam = 0;

        ["isim", "şehir", "hayvan", "bitki", "eşya"].forEach((kat) => {
          const girilen = (cevaplar[kat] || "").toLowerCase().trim();
          if (!girilen || !kelimeler[kat].has(girilen)) {
            puanlar[kat] = 0;
            return;
          }
          const digerCevaplar = Object.entries(cevaplarListesi).filter(([oid]) => oid !== id);
          const ayniVar = digerCevaplar.some(([_, o]) => (o.cevaplar[kat] || "").toLowerCase().trim() === girilen);
          puanlar[kat] = ayniVar ? 5 : 10;
          toplam += puanlar[kat];
        });

        tumPuanlar[id] = {
          isim,
          cevaplar,
          puanlar,
          toplam
        };
      }

      // herkese gönder
      for (const [id, veri] of Object.entries(tumPuanlar)) {
        io.to(id).emit("puanSonucu", {
          benim: veri.cevaplar,
          puanlar: veri.puanlar,
          toplam: veri.toplam,
          herkes: Object.values(tumPuanlar).map(v => ({ isim: v.isim, puan: v.toplam }))
        });
      }

      cevaplarListesi = {};
    }
  });

  socket.on("disconnect", () => {
    oyuncular = oyuncular.filter(o => o.id !== socket.id);
    hazirOyuncular = hazirOyuncular.filter(id => id !== socket.id);
    delete cevaplarListesi[socket.id];
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 Sunucu aktif: http://localhost:${PORT}`);
});
