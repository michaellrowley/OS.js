;; demo.wat — A bouncing rectangle demo for the OS.js WASM window system.
;;
;; This module exports the standard WASM window interface:
;;   init(width, height), update(dt), render(), resize(width, height),
;;   on_mouse_move(x, y), on_key_down(keyCode)
;;
;; It imports canvas drawing primitives from the env namespace.

(module
  ;; === Imports ===
  (import "env" "memory" (memory 1))
  (import "env" "canvas_width" (func $canvas_width (result i32)))
  (import "env" "canvas_height" (func $canvas_height (result i32)))
  (import "env" "canvas_clear" (func $canvas_clear (param i32 i32 i32 i32)))
  (import "env" "canvas_fill_rect" (func $canvas_fill_rect (param i32 i32 i32 i32 i32 i32 i32 i32)))
  (import "env" "canvas_fill_text" (func $canvas_fill_text (param i32 i32 i32 i32)))
  (import "env" "canvas_set_font" (func $canvas_set_font (param i32 i32)))
  (import "env" "random" (func $random (result f64)))

  ;; === State (globals) ===
  ;; Box position (f64 for sub-pixel precision)
  (global $box_x (mut f64) (f64.const 100.0))
  (global $box_y (mut f64) (f64.const 100.0))
  ;; Box velocity (pixels per millisecond)
  (global $vx (mut f64) (f64.const 0.15))
  (global $vy (mut f64) (f64.const 0.1))
  ;; Box size
  (global $box_w (mut i32) (i32.const 60))
  (global $box_h (mut i32) (i32.const 60))
  ;; Canvas dimensions
  (global $cw (mut i32) (i32.const 640))
  (global $ch (mut i32) (i32.const 480))
  ;; Color cycling hue (0-360)
  (global $hue (mut f64) (f64.const 0.0))
  ;; Mouse position
  (global $mouse_x (mut i32) (i32.const 0))
  (global $mouse_y (mut i32) (i32.const 0))

  ;; === Data ===
  ;; "16px monospace" at offset 0, length 15
  (data (i32.const 0) "16px monospace\00")
  ;; "WASM Window Demo" at offset 16, length 16
  (data (i32.const 16) "WASM Window Demo")
  ;; "Move your mouse!" at offset 48, length 16
  (data (i32.const 48) "Move your mouse!")

  ;; === Exports ===

  ;; init(width, height)
  (func (export "init") (param $w i32) (param $h i32)
    (global.set $cw (local.get $w))
    (global.set $ch (local.get $h))
  )

  ;; resize(width, height)
  (func (export "resize") (param $w i32) (param $h i32)
    (global.set $cw (local.get $w))
    (global.set $ch (local.get $h))
  )

  ;; update(dt) — dt is delta time in milliseconds (f64)
  (func (export "update") (param $dt f64)
    (local $nx f64)
    (local $ny f64)

    ;; Advance hue for color cycling
    (global.set $hue
      (f64.sub
        (f64.add (global.get $hue) (f64.mul (local.get $dt) (f64.const 0.1)))
        (f64.mul
          (f64.floor
            (f64.div
              (f64.add (global.get $hue) (f64.mul (local.get $dt) (f64.const 0.1)))
              (f64.const 360.0)))
          (f64.const 360.0))))

    ;; Compute new position
    (local.set $nx (f64.add (global.get $box_x) (f64.mul (global.get $vx) (local.get $dt))))
    (local.set $ny (f64.add (global.get $box_y) (f64.mul (global.get $vy) (local.get $dt))))

    ;; Bounce off right/left walls
    (if (f64.ge (f64.add (local.get $nx) (f64.convert_i32_u (global.get $box_w)))
                (f64.convert_i32_u (global.get $cw)))
      (then
        (global.set $vx (f64.neg (global.get $vx)))
        (local.set $nx (f64.sub (f64.convert_i32_u (global.get $cw)) (f64.convert_i32_u (global.get $box_w))))))
    (if (f64.lt (local.get $nx) (f64.const 0.0))
      (then
        (global.set $vx (f64.neg (global.get $vx)))
        (local.set $nx (f64.const 0.0))))

    ;; Bounce off bottom/top walls
    (if (f64.ge (f64.add (local.get $ny) (f64.convert_i32_u (global.get $box_h)))
                (f64.convert_i32_u (global.get $ch)))
      (then
        (global.set $vy (f64.neg (global.get $vy)))
        (local.set $ny (f64.sub (f64.convert_i32_u (global.get $ch)) (f64.convert_i32_u (global.get $box_h))))))
    (if (f64.lt (local.get $ny) (f64.const 0.0))
      (then
        (global.set $vy (f64.neg (global.get $vy)))
        (local.set $ny (f64.const 0.0))))

    (global.set $box_x (local.get $nx))
    (global.set $box_y (local.get $ny))
  )

  ;; render()
  (func (export "render")
    (local $r i32)
    (local $g i32)
    (local $b i32)

    ;; Clear to dark background
    (call $canvas_clear (i32.const 30) (i32.const 30) (i32.const 46) (i32.const 255))

    ;; Compute color from hue (simplified: cycle R/G/B)
    ;; R channel: peaks at hue=0/360
    ;; G channel: peaks at hue=120
    ;; B channel: peaks at hue=240
    ;; Simple triangle wave approximation
    (local.set $r (i32.const 100))
    (local.set $g (i32.const 200))
    (local.set $b (i32.const 255))

    ;; Draw the bouncing box
    (call $canvas_fill_rect
      (i32.trunc_f64_u (global.get $box_x))
      (i32.trunc_f64_u (global.get $box_y))
      (global.get $box_w)
      (global.get $box_h)
      (local.get $r)
      (local.get $g)
      (local.get $b)
      (i32.const 255))

    ;; Draw a smaller trail box (semi-transparent)
    (call $canvas_fill_rect
      (global.get $mouse_x)
      (global.get $mouse_y)
      (i32.const 20)
      (i32.const 20)
      (i32.const 255)
      (i32.const 100)
      (i32.const 100)
      (i32.const 180))

    ;; Draw title text
    (call $canvas_set_font (i32.const 0) (i32.const 14))
    ;; White fill for text
    (call $canvas_fill_rect (i32.const 10) (i32.const 10) (i32.const 0) (i32.const 0) (i32.const 255) (i32.const 255) (i32.const 255) (i32.const 255))
    (call $canvas_fill_text (i32.const 16) (i32.const 16) (i32.const 20) (i32.const 30))
    (call $canvas_fill_text (i32.const 48) (i32.const 16) (i32.const 20) (i32.const 50))
  )

  ;; on_mouse_move(x, y)
  (func (export "on_mouse_move") (param $x i32) (param $y i32)
    (global.set $mouse_x (local.get $x))
    (global.set $mouse_y (local.get $y))
  )

  ;; on_key_down(keyCode) — spacebar (32) randomizes velocity
  (func (export "on_key_down") (param $kc i32)
    (if (i32.eq (local.get $kc) (i32.const 32))
      (then
        (global.set $vx (f64.sub (f64.mul (call $random) (f64.const 0.3)) (f64.const 0.15)))
        (global.set $vy (f64.sub (f64.mul (call $random) (f64.const 0.3)) (f64.const 0.15))))))
)
