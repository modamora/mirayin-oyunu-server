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
    methods: ["GET", "POST"]
  }
});

// ✅ Kelimeleri yükle
function kelimeleriYukle(dosyaAdi) {
  const dosyaYolu = path.join(__dirname, "kelimeler", dosyaAdi);
  return fs.readFileSync(dosyaYolu, "utf-8")
    .split("\n")
    .map(k => k.trim().toLowerCase())
    .filter(k => k.length > 0);
}

const kelimeListeleri = {
  isim: kelimeleriYukle("isimler.txt"),
  şehir: kelimeleriYukle("sehirler.txt"),
  hayvan: kelimeleriYukle("hayvanlar.txt"),
  bitki: kelimeleriYukle("bitkiler.txt"),
  eşya: kelimeleriYukle("esyalar.txt")
};

let oyuncular = [];
let hazirOyuncular = [];
let cevaplarListesi = {};

io.on("connection", (socket) => {
  console.log("🔌 Yeni bağlantı:", socket.id);

  socket.on("yeniOyuncu", (isim) => {
    socket.data.isim = isim;
    oyuncular.push({ id: socket.id, isim });
    console.log("🧑 Yeni Oyuncu:", isim);

    if (oyuncular.length >= 2) {
      io.emit("oyunaBasla");
    }
  });

  socket.on("hazir", () => {
    if (!hazirOyuncular.includes(socket.id)) {
      hazirOyuncular.push(socket.id);
    }

    if (hazirOyuncular.length === oyuncular.length && oyuncular.length > 0) {
      const harfler = [..."ABCÇDEFGHIİJKLMNOÖPRSŞTUÜVYZ"];
      const secilenHarf = harfler[Math.floor(Math.random() * harfler.length)];
      io.emit("harf", secilenHarf);
      hazirOyuncular = [];
    }
  });

  socket.on("cevaplar", (veri) => {
    cevaplarListesi[socket.id] = {
      isim: veri.isim,
      cevaplar: veri.cevaplar
    };

    if (Object.keys(cevaplarListesi).length === 2) {
      const [id1, id2] = Object.keys(cevaplarListesi);
      const o1 = cevaplarListesi[id1];
      const o2 = cevaplarListesi[id2];

      const kategoriler = ["isim", "şehir", "hayvan", "bitki", "eşya"];
      const puan1 = {}, puan2 = {};
      let toplam1 = 0, toplam2 = 0;

      kategoriler.forEach(kat => {
        const c1 = (o1.cevaplar[kat] || "").toLowerCase().trim();
        const c2 = (o2.cevaplar[kat] || "").toLowerCase().trim();

        const ayni = c1 === c2 && c1 !== "";

        const kelimeGecerli = (kelime) =>
          kelime &&
          kelime.startsWith(c1[0]) &&
          kelimeListeleri[kat]?.includes(kelime);

        const gecerli1 = kelimeGecerli(c1);
        const gecerli2 = kelimeGecerli(c2);

        puan1[kat] = gecerli1 ? (ayni ? 5 : 10) : 0;
        puan2[kat] = gecerli2 ? (ayni ? 5 : 10) : 0;

        toplam1 += puan1[kat];
        toplam2 += puan2[kat];
      });

      io.to(id1).emit("puanSonucu", {
        benim: o1.cevaplar,
        rakip: { isim: o2.isim, cevaplar: o2.cevaplar },
        puanlar: puan1,
        toplam: toplam1,
        rakipToplam: toplam2
      });

      io.to(id2).emit("puanSonucu", {
        benim: o2.cevaplar,
        rakip: { isim: o1.isim, cevaplar: o1.cevaplar },
        puanlar: puan2,
        toplam: toplam2,
        rakipToplam: toplam1
      });

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
