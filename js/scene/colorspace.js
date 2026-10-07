// Custom shaders write colours authored in display (sRGB) space. When the frame goes through the
// post-processing chain (linear buffer, OutputPass encodes at the end) they must write linear values
// instead; when the frame is drawn straight to the canvas they write their colours as they are.
// One shared uniform switches every custom material at once, so all quality tiers look the same.
//
// The HalfFloat buffer of the composer path does not clamp like an 8-bit canvas does: a fragment
// with a runaway colour or alpha becomes Inf, and the bloom blur then smears it over the whole
// frame (a white screen). outColor() and outAlpha() keep every custom fragment bounded.

export const OUTPUT = { uLinearOut: { value: 0 } };

/** GLSL: call outColor(rgb) and outAlpha(a) on the final values of every custom fragment shader. */
export const OUTPUT_GLSL = `
  uniform float uLinearOut;
  vec3 outColor(vec3 c) { c = clamp(c, vec3(0.0), vec3(16.0)); return mix(c, pow(c, vec3(2.2)), uLinearOut); }
  float outAlpha(float a) { return clamp(a, 0.0, 1.0); }
`;
