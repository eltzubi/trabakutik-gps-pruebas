"""El modo --stream que se le añadió para la nube (python3 -m unittest)."""
import importlib.util, io, json, unittest
from pathlib import Path

spec = importlib.util.spec_from_file_location("duel", Path(__file__).resolve().parents[1] / "scripts" / "duel.py")
duel = importlib.util.module_from_spec(spec); spec.loader.exec_module(duel)


def flujo(*eventos):
    return io.BytesIO(b"".join(b"event: x\ndata: " + json.dumps(e).encode() + b"\n\n" for e in eventos))


class Stream(unittest.TestCase):
    def test_devuelve_la_respuesta_final(self):
        final = {"id": "resp_1", "status": "completed", "output": []}
        r = duel._read_stream(flujo({"type": "response.output_text.delta", "delta": "ho"},
                                    {"type": "response.completed", "response": final}))
        self.assertEqual(r, final)

    def test_sin_evento_final_falla(self):
        with self.assertRaises(duel.DuelError):
            duel._read_stream(flujo({"type": "response.output_text.delta", "delta": "ho"}))

    def test_un_error_en_el_flujo_falla(self):
        with self.assertRaises(duel.DuelError):
            duel._read_stream(flujo({"type": "error", "message": "x"}))


if __name__ == "__main__":
    unittest.main()
