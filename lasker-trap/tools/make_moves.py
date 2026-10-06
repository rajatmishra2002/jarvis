"""Validate the Lasker Trap line with python-chess and export everything the renderer needs."""
import json, chess

SAN = ['d4', 'd5', 'c4', 'e5', 'dxe5', 'd4', 'e3', 'Bb4+', 'Bd2', 'dxe3', 'Bxb4', 'exf2+',
       'Ke2', 'fxg1=N+', 'Rxg1', 'Bg4+']
NOTATION = ['1.d4', '1...d5', '2.c4', '2...e5', '3.dxe5', '3...d4', '4.e3', '4...Bb4+', '5.Bd2', '5...dxe3',
            '6.Bxb4', '6...exf2+', '7.Ke2', '7...fxg1=N+', '8.Rxg1', '8...Bg4+']

def xy(sq):  # square -> board-unit centre, white at bottom
    return [chess.square_file(sq) + 0.5, 7 - chess.square_rank(sq) + 0.5]

b = chess.Board()
pieces = []   # id, sym, start square
ids = {}      # square -> id
for sq in chess.SQUARES:
    p = b.piece_at(sq)
    if p:
        pid = len(pieces)
        pieces.append(dict(id=pid, sym=p.symbol(), sq=chess.square_name(sq), xy=xy(sq)))
        ids[sq] = pid

moves = []
for i, san in enumerate(SAN):
    mv = b.parse_san(san)
    mover = b.piece_at(mv.from_square)
    mover_id = ids.pop(mv.from_square)
    cap = None
    if b.is_en_passant(mv):
        cs = chess.square(chess.square_file(mv.to_square), chess.square_rank(mv.from_square))
        cap = dict(id=ids.pop(cs), sym=b.piece_at(cs).symbol(), sq=chess.square_name(cs), xy=xy(cs))
    elif b.piece_at(mv.to_square):
        cp = b.piece_at(mv.to_square)
        cap = dict(id=ids.pop(mv.to_square), sym=cp.symbol(), sq=chess.square_name(mv.to_square), xy=xy(mv.to_square))
    ids[mv.to_square] = mover_id
    color = 'w' if mover.color else 'b'
    b.push(mv)
    checkers = [dict(sq=chess.square_name(s), xy=xy(s), sym=b.piece_at(s).symbol()) for s in b.checkers()]
    king_sq = b.king(b.turn)
    moves.append(dict(
        i=i, notation=NOTATION[i], san=san, uci=mv.uci(), color=color,
        id=mover_id, sym=mover.symbol(), from_sq=chess.square_name(mv.from_square), to_sq=chess.square_name(mv.to_square),
        from_xy=xy(mv.from_square), to_xy=xy(mv.to_square),
        captured=cap, promo=(chess.piece_symbol(mv.promotion) if mv.promotion else None),
        check=b.is_check(), checkers=checkers, king_xy=xy(king_sq) if b.is_check() else None,
        fen=b.fen()))

# --- extra facts used by the finale visuals -------------------------------------------
final = b
wk = final.king(chess.WHITE)
nbrs = []
for sq in chess.SQUARES:
    if chess.square_distance(sq, wk) == 1:
        p = final.piece_at(sq)
        nbrs.append(dict(sq=chess.square_name(sq), xy=xy(sq),
                         black_attacks=final.is_attacked_by(chess.BLACK, sq), occupied=bool(p)))
queen_sq = [s for s in chess.SQUARES if final.piece_at(s) == chess.Piece(chess.QUEEN, chess.WHITE)][0]
bq_sq = [s for s in chess.SQUARES if final.piece_at(s) == chess.Piece(chess.QUEEN, chess.BLACK)][0]
info = dict(
    king_nbrs=nbrs, white_queen=dict(sq=chess.square_name(queen_sq), xy=xy(queen_sq)),
    black_queen=dict(sq=chess.square_name(bq_sq), xy=xy(bq_sq)),
    # every legal White reply loses the queen? check by brute force
)
losing = []
for mv in final.legal_moves:
    t = final.copy(); t.push(mv)
    can_take_q = any(m.to_square == (mv.to_square if final.piece_at(mv.from_square).piece_type == chess.QUEEN else queen_sq)
                     for m in t.legal_moves if t.piece_at(m.from_square) and t.piece_at(m.from_square).color == chess.BLACK)
    losing.append((mv.uci(), can_take_q))
info['white_legal'] = losing
json.dump(dict(pieces=pieces, moves=moves, finale=info), open('data/moves.json', 'w'), indent=1)
print('final FEN:', final.fen()); print('legal white replies and whether Black can then win the queen:')
for u, q in losing: print(' ', u, q)
print('king neighbours:', [(n['sq'], n['black_attacks'], n['occupied']) for n in nbrs])
