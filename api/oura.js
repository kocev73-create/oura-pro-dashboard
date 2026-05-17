export default async function handler(req, res) {

  const token = req.headers.authorization;

  if (!token) {
    return res.status(401).json({
      error: "Missing token"
    });
  }

  try {

    const today = new Date().toISOString().slice(0,10);

    const url =
      `https://api.ouraring.com/v2/usercollection/daily_readiness?start_date=${today}&end_date=${today}`;

    const r = await fetch(url, {
      headers: {
        Authorization: token
      }
    });

    const data = await r.json();

    res.status(200).json(data);

  } catch(err){

    res.status(500).json({
      error: err.message
    });

  }
}
