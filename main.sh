parallel --no-notice rm -r ::: s1/* s2/* s3/* s4/* s5/* s6/* s7/* s8/* s9/* s10/* s11/* s12/* s13/*
parallel --no-notice rm -r ::: s14/* s15/* s16/* s17/* s18/* s19/* s20/* s21/* s22/* s23/* s24/* s25/*
cd s
parallel convert {} -resize 3000x3000 {.}.png ::: *.* 
rm *.jpg
rm *.JPG
parallel convert {} ../s25/{} ::: *.*
cd ..
cd s
parallel gmic {} -fx_imagegrid 20,20 -o ../s9/{} ::: *.*
cd ..
cd s9
parallel convert {} -modulate 100,150,100  ../s1/{} ::: *.* 
cd ..
cd s1
for i in *.* 
do 
convert $i ../s9/$i -alpha set -channel A -evaluate set 100% -compose softlight -composite ../s3/$i 
done 
cd .. 
cd s3
parallel gmic {} -fx_poster_edges 20,30,5,0,10,0,0,0 -o ../s4/{} ::: *.* 
cd ..
cd s4
for i in *.*; do
   convert $i  -set filename:new ../s25/"%tg2" "%[filename:new].png"
done 
cd ..
cd s4
parallel gmic {} -gcd_auto_balance 30,0,0,1,0 -o ../s9/{} ::: *.* 
cd ..
cd s9
for i in *.*; do
   convert $i  -set filename:new ../s25/"%tg2_a" "%[filename:new].png"
done 
cd ..
cd s
parallel gmic {} -fx_imagegrid 30,30 -o ../s9/{} ::: *.*
cd ..
cd s9
parallel convert {} -modulate 100,150,100  ../s1/{} ::: *.* 
cd ..
cd s1
for i in *.* 
do 
convert $i ../s9/$i -alpha set -channel A -evaluate set 100% -compose softlight -composite ../s3/$i 
done 
cd .. 
cd s3
parallel gmic {} -fx_poster_edges 20,30,5,0,10,0,0,0 -o ../s4/{} ::: *.* 
cd ..
cd s4
for i in *.*; do
   convert $i  -set filename:new ../s25/"%tg3" "%[filename:new].png"
done 
cd .. 
cd s4
parallel gmic {} -gcd_auto_balance 30,0,0,1,0 -o ../s5/{} ::: *.* 
cd ..
cd s5
for i in *.*; do
   convert $i  -set filename:new ../s25/"%tg5" "%[filename:new].png"
done 




