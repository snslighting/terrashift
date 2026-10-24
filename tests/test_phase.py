import numpy as np
import pytest

from terrashift.phase import NATIVE_CONVENTION, phase_to_los_mm, reference_phase


def test_phase_sign_from_physical_range_change():
    wavelength = 0.24
    # Secondary range decreases 12 mm (ground moves toward satellite).
    # exp(-i4piR/lambda): ref*conj(sec) has phase 4pi*(Rsec-Rref)/lambda.
    delta_range = -0.012
    phase = 4 * np.pi * delta_range / wavelength
    assert phase_to_los_mm(phase, 299792458 / wavelength, convention=NATIVE_CONVENTION) == pytest.approx(12)
    assert np.isnan(phase_to_los_mm(np.nan, 1.2e9, convention=NATIVE_CONVENTION))
    with pytest.raises(ValueError, match="Unknown"):
        phase_to_los_mm(phase, 1.2e9, convention="unspecified")


def test_reference_preserves_signal_and_rejects_unknown_component_offsets():
    phase = np.full((10, 10), 4.0)
    phase[5:, :] = 5
    phase[0, 0] = 1000  # robust against an outlier
    region = np.zeros_like(phase, dtype=bool)
    region[:5, :] = True
    component = np.ones_like(phase)
    component[9, :] = 2
    output, report = reference_phase(phase, np.ones_like(region), component, region)
    assert np.median(output[:5]) == 0
    np.testing.assert_allclose(output[5:9], 1)
    assert np.isnan(output[9]).all()
    assert report["reference_uncertainty_radians"] is None
    region[9, :] = True
    with pytest.raises(ValueError, match="crosses"):
        reference_phase(phase, np.ones_like(region), component, region)


def test_corrections_recover_physical_ground_signal():
    from terrashift.phase import correct_native_phase

    wavelength = 0.24
    k = 4 * np.pi / wavelength
    ground_toward = 0.018
    tide_toward = 0.04
    wet_range = 0.023
    hydro_range = -0.005
    ionosphere_phase = -0.7
    raw = -k * (ground_toward + tide_toward) + k * (wet_range + hydro_range) + ionosphere_phase
    corrected = correct_native_phase(
        raw,
        ionosphere_phase,
        k * wet_range,
        k * hydro_range,
        k * tide_toward,
        processor_version="0.25.16",
        specification_version="1.5.0",
    )
    assert phase_to_los_mm(corrected, 299792458 / wavelength, convention=NATIVE_CONVENTION) == pytest.approx(
        18
    )
    assert np.isnan(
        correct_native_phase(raw, np.nan, 0, 0, 0, processor_version="0.25.16", specification_version="1.5.0")
    )
    with pytest.raises(ValueError, match="not been reviewed"):
        correct_native_phase(raw, 0, 0, 0, 0, processor_version="unknown", specification_version="1.5.0")
