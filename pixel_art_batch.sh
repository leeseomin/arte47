#!/usr/bin/env bash
#
# pixel_art_batch.sh
#
# 목적:
#   원본 이미지를 "격자효과"가 아니라
#   "저해상도화 + 팔레트 제한 + 정수배 확대" 방식으로
#   픽셀아트 느낌이 나도록 일괄 변환합니다.
#
# 필요 프로그램:
#   - ImageMagick (magick)
#   - GNU parallel
#
# 기본 사용:
#   chmod +x pixel_art_batch.sh
#   ./pixel_art_batch.sh
#
# 옵션(환경변수):
#   SRC=s              # 입력 폴더
#   OUT=s25            # 출력 폴더
#   LOW=100            # 축소 해상도 기준 (LOW x LOW)
#   SCALE=30           # 정수배 확대 (LOW=100, SCALE=30 -> 최대 3000px)
#   COLORS=32          # 팔레트 색 수
#   CROP_SQUARE=0      # 1이면 정사각형으로 크롭 후 처리
#   PALETTE=palette.png # 지정 팔레트 이미지가 있으면 remap 사용
#   JOBS=8             # 병렬 개수
#
# 예시:
#   LOW=80 SCALE=37 COLORS=24 ./pixel_art_batch.sh
#   CROP_SQUARE=1 LOW=100 SCALE=30 COLORS=16 ./pixel_art_batch.sh
#   PALETTE=palette.png ./pixel_art_batch.sh
#

set -euo pipefail
shopt -s nullglob

SRC="${SRC:-s}"
OUT="${OUT:-s25}"
LOW="${LOW:-100}"
SCALE="${SCALE:-30}"
COLORS="${COLORS:-32}"
CROP_SQUARE="${CROP_SQUARE:-0}"
PALETTE="${PALETTE:-}"
JOBS="${JOBS:-$(getconf _NPROCESSORS_ONLN 2>/dev/null || echo 4)}"

# 출력 폴더 구성
OUT_CLEAN="$OUT/clean"
OUT_DITHER="$OUT/dither"
OUT_STRONG="$OUT/strong"
OUT_OUTLINE="$OUT/outline"

mkdir -p "$OUT_CLEAN" "$OUT_DITHER" "$OUT_STRONG" "$OUT_OUTLINE"

# 필요 명령 체크
command -v magick >/dev/null 2>&1 || {
  echo "오류: ImageMagick(magick)이 필요합니다." >&2
  exit 1
}

command -v parallel >/dev/null 2>&1 || {
  echo "오류: GNU parallel 이 필요합니다." >&2
  exit 1
}

# 입력 파일 존재 체크
mapfile -d '' FILES < <(
  find "$SRC" -maxdepth 1 -type f \
    \( -iname '*.jpg' -o -iname '*.jpeg' -o -iname '*.png' -o -iname '*.webp' -o -iname '*.bmp' -o -iname '*.tif' -o -iname '*.tiff' \) \
    -print0
)

if [ "${#FILES[@]}" -eq 0 ]; then
  echo "오류: 입력 폴더 '$SRC' 에 처리할 이미지가 없습니다." >&2
  exit 1
fi

# palette 옵션 구성
if [ -n "$PALETTE" ] && [ -f "$PALETTE" ]; then
  USE_PALETTE=1
else
  USE_PALETTE=0
fi

process_one() {
  local in="$1"
  local base name
  local low_strong scale_strong

  base="$(basename "$in")"
  name="${base%.*}"

  # 강한 픽셀아트 버전용
  low_strong=$(( LOW / 2 ))
  [ "$low_strong" -lt 16 ] && low_strong=16

  scale_strong=$(( SCALE * 2 ))

  # 공통 리사이즈 옵션
  local resize_main=()
  local resize_strong=()

  if [ "$CROP_SQUARE" = "1" ]; then
    resize_main=(-resize "${LOW}x${LOW}^" -gravity center -extent "${LOW}x${LOW}")
    resize_strong=(-resize "${low_strong}x${low_strong}^" -gravity center -extent "${low_strong}x${low_strong}")
  else
    resize_main=(-resize "${LOW}x${LOW}")
    resize_strong=(-resize "${low_strong}x${low_strong}")
  fi

  # 1) clean : 가장 무난한 픽셀아트
  if [ "$USE_PALETTE" = "1" ]; then
    magick "$in" -auto-orient -strip \
      "${resize_main[@]}" \
      -modulate 105,115,100 \
      -dither None -remap "$PALETTE" \
      -scale "${SCALE}00%" \
      "$OUT_CLEAN/${name}_clean.png"
  else
    magick "$in" -auto-orient -strip \
      "${resize_main[@]}" \
      -modulate 105,115,100 \
      -dither None -colors "$COLORS" \
      -scale "${SCALE}00%" \
      "$OUT_CLEAN/${name}_clean.png"
  fi

  # 2) dither : 레트로 디더링 버전
  if [ "$USE_PALETTE" = "1" ]; then
    magick "$in" -auto-orient -strip \
      "${resize_main[@]}" \
      -modulate 105,120,100 \
      -ordered-dither o4x4,4 \
      -remap "$PALETTE" \
      -scale "${SCALE}00%" \
      "$OUT_DITHER/${name}_dither.png"
  else
    magick "$in" -auto-orient -strip \
      "${resize_main[@]}" \
      -modulate 105,120,100 \
      -ordered-dither o4x4,4 \
      -colors "$COLORS" \
      -scale "${SCALE}00%" \
      "$OUT_DITHER/${name}_dither.png"
  fi

  # 3) strong : 더 강한 픽셀화
  if [ "$USE_PALETTE" = "1" ]; then
    magick "$in" -auto-orient -strip \
      "${resize_strong[@]}" \
      -dither None -remap "$PALETTE" \
      -scale "${scale_strong}00%" \
      "$OUT_STRONG/${name}_strong.png"
  else
    magick "$in" -auto-orient -strip \
      "${resize_strong[@]}" \
      -dither None -colors 16 \
      -scale "${scale_strong}00%" \
      "$OUT_STRONG/${name}_strong.png"
  fi

  # 4) outline : 외곽선 강조 버전
  if [ "$USE_PALETTE" = "1" ]; then
    magick "$in" -auto-orient -strip \
      "${resize_main[@]}" \
      \( +clone -colorspace Gray -edge 1 -negate -threshold 45% \) \
      -compose Multiply -composite \
      -dither None -remap "$PALETTE" \
      -scale "${SCALE}00%" \
      "$OUT_OUTLINE/${name}_outline.png"
  else
    magick "$in" -auto-orient -strip \
      "${resize_main[@]}" \
      \( +clone -colorspace Gray -edge 1 -negate -threshold 45% \) \
      -compose Multiply -composite \
      -dither None -colors "$COLORS" \
      -scale "${SCALE}00%" \
      "$OUT_OUTLINE/${name}_outline.png"
  fi
}

export -f process_one
export LOW SCALE COLORS CROP_SQUARE PALETTE USE_PALETTE
export OUT_CLEAN OUT_DITHER OUT_STRONG OUT_OUTLINE

printf '%s\0' "${FILES[@]}" | parallel -0 --no-notice -j "$JOBS" process_one {}

echo "완료:"
echo "  clean   -> $OUT_CLEAN"
echo "  dither  -> $OUT_DITHER"
echo "  strong  -> $OUT_STRONG"
echo "  outline -> $OUT_OUTLINE"

