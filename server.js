require("dotenv").config();

const express = require("express");
const cors = require("cors");
const axios = require("axios");
const fs = require("fs-extra");
const ffmpeg = require("fluent-ffmpeg");
const cloudinary = require("cloudinary").v2;

const app = express();

app.use(cors());
app.use(express.json());

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

/* =========================================
   RENDER 360
========================================= */

app.post("/render360", async (req, res) => {

  try {

    const {
      videoUrl,
      eventId
    } = req.body;

    if (!videoUrl) {

      return res.status(400).json({
        success:false,
        error:"videoUrl requerido"
      });

    }

    const finalEventId =
      eventId || "default-event";

    await fs.ensureDir("temp");

    const stamp = Date.now();

    const inputPath =
      `temp/input-${stamp}.mp4`;

    const outputPath =
      `temp/output-${stamp}.mp4`;

    console.log(
      "⬇ DESCARGANDO VIDEO..."
    );

    const response =
      await axios({

        url:videoUrl,
        method:"GET",
        responseType:"stream"

      });

    const writer =
      fs.createWriteStream(
        inputPath
      );

    response.data.pipe(
      writer
    );

    await new Promise(
      (resolve,reject)=>{

        writer.on(
          "finish",
          resolve
        );

        writer.on(
          "error",
          reject
        );

      }
    );

    console.log(
      "🎬 GENERANDO VIDEO..."
    );

    await renderVideo(
      inputPath,
      outputPath
    );

    console.log(
      "☁ SUBIENDO FINAL..."
    );

    const uploadResult =
      await cloudinary
      .uploader
      .upload(
        outputPath,
        {
          resource_type:
          "video",

          folder:
`snoopbox/${finalEventId}/360/rendered`
        }
      );

    await fs.remove(
      inputPath
    );

    await fs.remove(
      outputPath
    );

    console.log(
      "✅ RENDER FINAL OK"
    );

    res.json({

      success:true,

      renderedUrl:
      uploadResult.secure_url

    });

  }

  catch(error){

    console.error(
      error
    );

    res.status(500).json({

      success:false,

      error:error.message

    });

  }

});

/* =========================================
   RENDER ENGINE
========================================= */

async function renderVideo(
  input,
  output
){

return new Promise(
(resolve,reject)=>{

ffmpeg()

.input(input)

.inputOptions([
"-noautorotate"
])

.input(
"assets/music.mp3"
)

.complexFilter([

// BASE ORIGINAL

"[0:v]eq=contrast=1.10:saturation=1.18:brightness=0.02,unsharp=5:5:1.2:5:5:0.0[vbase]",

// NORMAL

"[vbase]trim=0:6,setpts=PTS-STARTPTS[v1]",

// SLOW

"[vbase]trim=6:10,setpts=2.0*(PTS-STARTPTS)[v2]",

// FAST

"[vbase]trim=10:14,setpts=0.7*(PTS-STARTPTS),tblend=average[v3]",

// REVERSE

"[vbase]trim=10:14,reverse,setpts=PTS-STARTPTS[v4]",

// CONCAT

"[v1][v2][v3][v4]concat=n=4:v=1:a=0[vcat]",

// FADE

"[vcat]fade=t=in:st=0:d=1,fade=t=out:st=20:d=2[outv]"

])

.outputOptions([

"-map [outv]",

"-map 1:a",

"-shortest",

"-preset fast",

"-crf 18",

"-movflags +faststart",

"-af volume=0.35"

])

.videoCodec(
"libx264"
)

.save(
output
)

.on(
"end",
()=>{

console.log(
"🎉 VIDEO RENDERIZADO"
);

resolve();

}
)

.on(
"error",
(err)=>{

console.error(
err
);

reject(
err
);

}
);

});

}

/* =========================================
   TEST LOCAL
========================================= */

app.get(
"/test-render",
async(req,res)=>{

try{

await renderVideo(
"temp/test.mp4",
"temp/test-output.mp4"
);

res.json({
ok:true
});

}

catch(err){

console.error(err);

res.status(500).json({
ok:false,
error:err.message
});

}

});

/* =========================================
   SERVER
========================================= */

const PORT =
process.env.PORT
|| 3000;

app.listen(
PORT,
()=>{

console.log(
"🚀 RENDER WORKER ONLINE"
);

}
);