// server/middleware/validateComplex.js
const UB_DISTRICTS = [
  'KHAN_UUL','BAYANGOL','BAYANZURKH','SONGINOKHAIRKHAN',
  'CHINGELTEI','SUKHBAATAR','NALAIKH','BAGANUUR','BAGAKHANGAI',
];

export function validateComplexBody(req, res, next) {
  const { city, district } = req.body || {};
  if (city === 'ULAANBAATAR' && !UB_DISTRICTS.includes(district)) {
    return res.status(400).json({ error: 'ULAANBAATAR үед district нь УБ-ийн 9 дүүргийн нэг байх ёстой.' });
  }
  if (city !== 'ULAANBAATAR' && district !== 'NONE') {
    return res.status(400).json({ error: 'ULAANBAATAR биш хотод district=NONE илгээнэ үү.' });
  }
  next();
}
