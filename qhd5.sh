parallel --no-notice rm -r ::: s1/* s2/* s3/* s4/* s5/* s6/* s7/* s8/* s9/* s10/* s11/* s12/* s13/*
parallel --no-notice rm -r ::: s14/* s15/* s16/* s17/* s18/* s19/* s20/* s21/* s22/* s23/* s24/* s25/*
cd s
parallel convert {} -resize 2500x2500 {.}.png ::: *.* 
rm *.jpg
rm *.JPG
parallel convert {} ../s25/{} ::: *.*
cd ..
cd s
parallel gmic {} -fx_imagegrid 30,30 -o ../s9/{} ::: *.*
cd ..
cd s9
parallel gmic {} -fx_remove_hotpixels 5,10,0 -o ../s4/{} ::: *.*
cd ..
cd s4
for i in *.*; do
   convert $i  -set filename:new ../s25/"%tg2" "%[filename:new].png"
done 
cd ..
cd s
parallel gmic {} -fx_imagegrid 50,50 -o ../s2/{} ::: *.*
cd ..
cd s2
parallel gmic {} -fx_remove_hotpixels 5,10,0 -o ../s2/{} ::: *.*
cd ..
cd s2
for i in *.*; do
   convert $i  -set filename:new ../s25/"%tg1" "%[filename:new].png"
done 
cd ..
cd s2
for i in *.* 
do 
convert $i ../s2/$i -alpha set -channel A -evaluate set 100% -compose softlight -composite ../s3/$i 
done 
cd ..
cd s3
parallel gmic {} -fx_remove_hotpixels 5,10,0 -o ../s3/{} ::: *.*
cd ..
cd s3
for i in *.*; do
   convert $i  -set filename:new ../s25/"%tg1_soft" "%[filename:new].png"
done 
cd ..
cd s2
for i in *.* 
do 
convert $i ../s2/$i -alpha set  -compose screen -composite ../s3/$i 
done 
cd ..
cd s3
parallel gmic {} -fx_remove_hotpixels 5,10,0 -o ../s3/{} ::: *.*
cd ..
cd s3
for i in *.*; do
   convert $i  -set filename:new ../s25/"%tg1_screen" "%[filename:new].png"
done 

